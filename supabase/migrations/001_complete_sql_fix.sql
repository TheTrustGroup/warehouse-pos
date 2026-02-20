-- ============================================================
-- COMPLETE SQL FIX
-- Run this entire file in: Supabase Dashboard → SQL Editor → Run
--
-- What this does:
--   PART 1 — Creates sales + sale_lines tables
--   PART 2 — Creates record_sale() RPC (atomic sale recording + stock deduction)
--   PART 3 — Creates/replaces get_products_with_inventory() view helper
--             so GET /api/products ALWAYS returns quantityBySize for sized products
--   PART 4 — Analytics views (daily sales, top products, stock movements)
--   PART 5 — Grants + RLS
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 1 — SALES TABLES                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sales (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    uuid          NOT NULL,
  customer_name   text,
  payment_method  text          NOT NULL CHECK (payment_method IN ('Cash', 'MoMo', 'Card')),
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct    numeric(5,2)  NOT NULL DEFAULT 0,
  discount_amt    numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  item_count      int           NOT NULL DEFAULT 0,
  sold_by         text,
  receipt_id      text          UNIQUE,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_warehouse_date ON sales (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_date           ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_receipt        ON sales (receipt_id);

CREATE TABLE IF NOT EXISTS sale_lines (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       uuid          NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id    uuid          NOT NULL,
  size_code     text,
  product_name  text          NOT NULL DEFAULT '',
  product_sku   text          NOT NULL DEFAULT '',
  unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  qty           int           NOT NULL DEFAULT 1,
  line_total    numeric(12,2) NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale    ON sale_lines (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_product ON sale_lines (product_id);

-- Receipt number sequence
CREATE SEQUENCE IF NOT EXISTS receipt_seq START WITH 1;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 2 — record_sale() RPC                                             │
-- │                                                                          │
-- │  Called by POST /api/sales.                                             │
-- │  Atomically in ONE transaction:                                         │
-- │    1. Insert into sales (with auto receipt number)                      │
-- │    2. Insert all sale_lines (name/price snapshot)                       │
-- │    3. Deduct stock from warehouse_inventory_by_size (sized products)    │
-- │    4. Recalculate warehouse_inventory total                             │
-- │                                                                          │
-- │  Uses GREATEST(0, qty - sold) — stock NEVER goes negative.              │
-- │  If anything fails → full rollback.                                     │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION record_sale(
  p_warehouse_id   uuid,
  p_lines          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_amt   numeric,
  p_total          numeric,
  p_payment_method text,
  p_customer_name  text    DEFAULT NULL,
  p_sold_by        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as owner, bypasses RLS for stock updates
AS $$
DECLARE
  v_sale_id     uuid;
  v_receipt_id  text;
  v_item_count  int := 0;
  v_line        jsonb;
  v_product_id  uuid;
  v_size_code   text;
  v_qty         int;
  v_unit_price  numeric;
  v_line_total  numeric;
  v_name        text;
  v_sku         text;
  v_size_kind   text;
BEGIN

  -- 1. Generate receipt ID
  v_receipt_id := 'RCP-' || to_char(now() AT TIME ZONE 'Africa/Accra', 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 5, '0');

  -- 2. Insert sale header
  INSERT INTO sales (
    warehouse_id, customer_name, payment_method,
    subtotal, discount_pct, discount_amt, total,
    sold_by, receipt_id
  ) VALUES (
    p_warehouse_id, p_customer_name, p_payment_method,
    p_subtotal, p_discount_pct, p_discount_amt, p_total,
    p_sold_by, v_receipt_id
  )
  RETURNING id INTO v_sale_id;

  -- 3. Process each line
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP

    v_product_id := (v_line->>'productId')::uuid;
    v_size_code  := NULLIF(TRIM(COALESCE(v_line->>'sizeCode', '')), '');
    v_qty        := GREATEST(1, (v_line->>'qty')::int);
    v_unit_price := COALESCE((v_line->>'unitPrice')::numeric, 0);
    v_line_total := COALESCE((v_line->>'lineTotal')::numeric, v_unit_price * v_qty);
    v_name       := COALESCE(v_line->>'name', 'Unknown');
    v_sku        := COALESCE(v_line->>'sku', '');
    v_item_count := v_item_count + v_qty;

    -- Insert line item (snapshot of product name/price at time of sale)
    INSERT INTO sale_lines (
      sale_id, product_id, size_code,
      product_name, product_sku,
      unit_price, qty, line_total
    ) VALUES (
      v_sale_id, v_product_id, v_size_code,
      v_name, v_sku,
      v_unit_price, v_qty, v_line_total
    );

    -- Get size_kind for this product
    SELECT size_kind INTO v_size_kind
    FROM warehouse_products
    WHERE id = v_product_id;

    IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
      -- Deduct per-size stock (clamp to 0)
      UPDATE warehouse_inventory_by_size
      SET
        quantity   = GREATEST(0, quantity - v_qty),
        updated_at = now()
      WHERE
        warehouse_id = p_warehouse_id
        AND product_id = v_product_id
        AND upper(size_code) = upper(v_size_code);

      -- Recalculate total from sum of all sizes
      UPDATE warehouse_inventory
      SET
        quantity   = (
          SELECT COALESCE(SUM(quantity), 0)
          FROM warehouse_inventory_by_size
          WHERE warehouse_id = p_warehouse_id
            AND product_id   = v_product_id
        ),
        updated_at = now()
      WHERE
        warehouse_id = p_warehouse_id
        AND product_id = v_product_id;

    ELSE
      -- Direct deduct for non-sized products
      UPDATE warehouse_inventory
      SET
        quantity   = GREATEST(0, quantity - v_qty),
        updated_at = now()
      WHERE
        warehouse_id = p_warehouse_id
        AND product_id = v_product_id;
    END IF;

  END LOOP;

  -- 4. Update item count
  UPDATE sales SET item_count = v_item_count WHERE id = v_sale_id;

  -- 5. Return result
  RETURN jsonb_build_object(
    'id',            v_sale_id,
    'receiptId',     v_receipt_id,
    'warehouseId',   p_warehouse_id,
    'customerName',  p_customer_name,
    'paymentMethod', p_payment_method,
    'subtotal',      p_subtotal,
    'discountPct',   p_discount_pct,
    'discountAmt',   p_discount_amt,
    'total',         p_total,
    'itemCount',     v_item_count,
    'createdAt',     now()
  );

EXCEPTION WHEN OTHERS THEN
  -- Let the error bubble up naturally — transaction rolls back
  RAISE;
END;
$$;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 3 — Products view: ensures quantityBySize always populated        │
-- │                                                                          │
-- │  This fixes: "sizes not showing" in the inventory grid/edit modal.      │
-- │  The existing GET /api/products query may not be joining                 │
-- │  warehouse_inventory_by_size. This view does it correctly.               │
-- │                                                                          │
-- │  Your backend can query this view instead of warehouse_products:        │
-- │  SELECT * FROM v_products_inventory                                      │
-- │    WHERE warehouse_id = $1                                               │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Products are global (no warehouse_id in warehouse_products); inventory is per-warehouse.
-- View is driven by warehouse_inventory so warehouse_id comes from wi.
CREATE OR REPLACE VIEW v_products_inventory AS
SELECT
  wp.id,
  wi.warehouse_id,
  wp.sku,
  wp.barcode,
  wp.name,
  wp.description,
  wp.category,
  wp.size_kind                                          AS "sizeKind",
  wp.selling_price                                      AS "sellingPrice",
  wp.cost_price                                         AS "costPrice",
  wp.reorder_level                                      AS "reorderLevel",
  wp.location,
  wp.supplier,
  wp.tags,
  wp.images,
  wp.version,
  wp.created_at                                         AS "createdAt",
  wp.updated_at                                         AS "updatedAt",
  COALESCE(wi.quantity, 0)                              AS quantity,
  -- Build quantityBySize array:
  --   For sized products: aggregate from warehouse_inventory_by_size
  --   For others: empty array
  CASE
    WHEN wp.size_kind = 'sized' THEN (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'sizeCode',  wbs.size_code,
            'sizeLabel', COALESCE(sc.size_label, wbs.size_code),
            'quantity',  wbs.quantity
          )
          ORDER BY COALESCE(sc.size_order, 9999), wbs.size_code
        ),
        '[]'::jsonb
      )
      FROM warehouse_inventory_by_size wbs
      LEFT JOIN size_codes sc ON sc.size_code = wbs.size_code
      WHERE wbs.warehouse_id = wi.warehouse_id
        AND wbs.product_id   = wp.id
    )
    ELSE '[]'::jsonb
  END                                                   AS "quantityBySize"
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 4 — Analytics views                                               │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Drop first so column types can change (CREATE OR REPLACE cannot change types)
DROP VIEW IF EXISTS v_daily_sales;
DROP VIEW IF EXISTS v_top_products;
DROP VIEW IF EXISTS v_stock_movements;

-- Daily revenue per warehouse
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  warehouse_id,
  (created_at AT TIME ZONE 'Africa/Accra')::date   AS sale_date,
  COUNT(*)                                          AS transactions,
  SUM(item_count)                                   AS items_sold,
  SUM(subtotal)                                     AS gross_revenue,
  SUM(discount_amt)                                 AS total_discounts,
  SUM(total)                                        AS net_revenue,
  SUM(CASE WHEN payment_method = 'Cash' THEN total ELSE 0 END) AS cash_total,
  SUM(CASE WHEN payment_method = 'MoMo' THEN total ELSE 0 END) AS momo_total,
  SUM(CASE WHEN payment_method = 'Card' THEN total ELSE 0 END) AS card_total
FROM sales
GROUP BY warehouse_id, sale_date
ORDER BY sale_date DESC;

-- Top products by units sold
CREATE OR REPLACE VIEW v_top_products AS
SELECT
  sl.product_id,
  sl.product_name,
  sl.product_sku,
  sl.size_code,
  SUM(sl.qty)                    AS units_sold,
  SUM(sl.line_total)             AS revenue,
  COUNT(DISTINCT sl.sale_id)     AS transaction_count,
  AVG(sl.unit_price)             AS avg_unit_price
FROM sale_lines sl
GROUP BY sl.product_id, sl.product_name, sl.product_sku, sl.size_code
ORDER BY units_sold DESC;

-- Full stock movement audit trail
CREATE OR REPLACE VIEW v_stock_movements AS
SELECT
  sl.created_at                  AS moved_at,
  s.warehouse_id,
  sl.product_id,
  sl.product_name,
  sl.size_code,
  -sl.qty                        AS quantity_change,
  'sale'                         AS movement_type,
  s.receipt_id,
  s.payment_method,
  s.customer_name,
  sl.unit_price,
  sl.line_total                  AS value
FROM sale_lines sl
JOIN sales s ON s.id = sl.sale_id
ORDER BY sl.created_at DESC;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  PART 5 — Grants + RLS                                                  │
-- └─────────────────────────────────────────────────────────────────────────┘

ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_lines ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "auth_insert_sales"      ON sales;
DROP POLICY IF EXISTS "auth_read_sales"        ON sales;
DROP POLICY IF EXISTS "auth_insert_sale_lines" ON sale_lines;
DROP POLICY IF EXISTS "auth_read_sale_lines"   ON sale_lines;

CREATE POLICY "auth_insert_sales"      ON sales      FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_read_sales"        ON sales      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_sale_lines" ON sale_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_read_sale_lines"   ON sale_lines FOR SELECT TO authenticated USING (true);

-- Allow RPC to run as authenticated and service_role
GRANT EXECUTE ON FUNCTION record_sale TO authenticated;
GRANT EXECUTE ON FUNCTION record_sale TO service_role;
GRANT EXECUTE ON FUNCTION record_sale TO anon;

-- Allow reading views
GRANT SELECT ON v_products_inventory TO authenticated, service_role;
GRANT SELECT ON v_daily_sales        TO authenticated, service_role;
GRANT SELECT ON v_top_products       TO authenticated, service_role;
GRANT SELECT ON v_stock_movements    TO authenticated, service_role;
