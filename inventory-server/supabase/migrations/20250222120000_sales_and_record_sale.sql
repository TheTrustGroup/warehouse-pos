-- Sales and record_sale RPC for POS stock deduction.
-- POST /api/sales calls record_sale(); RPC atomically inserts sale + sale_lines and deducts stock.

-- Sales header
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  receipt_id text NOT NULL,
  customer_name text,
  payment_method text NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  discount_amt numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_warehouse_created ON sales(warehouse_id, created_at DESC);

-- Sale line items
CREATE TABLE IF NOT EXISTS sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES warehouse_products(id),
  size_code text,
  qty int NOT NULL CHECK (qty > 0),
  unit_price numeric(12,2) NOT NULL,
  line_total numeric(12,2) NOT NULL,
  name text,
  sku text
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id ON sale_lines(sale_id);

-- RPC: record_sale(warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, lines)
-- lines: jsonb array of { product_id, size_code, qty, unit_price, line_total, name, sku }
-- Returns: { id, receipt_id, created_at }
CREATE OR REPLACE FUNCTION record_sale(
  p_warehouse_id uuid,
  p_customer_name text,
  p_payment_method text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_discount_amt numeric,
  p_total numeric,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_receipt_id text;
  v_created_at timestamptz;
  v_line jsonb;
  v_product_id uuid;
  v_size_code text;
  v_qty int;
  v_size_kind text;
BEGIN
  v_sale_id := gen_random_uuid();
  v_receipt_id := 'R-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(v_sale_id::text, 1, 8));
  v_created_at := now();

  INSERT INTO sales (id, warehouse_id, receipt_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, created_at)
  VALUES (v_sale_id, p_warehouse_id, v_receipt_id, NULLIF(trim(p_customer_name), ''), p_payment_method, p_subtotal, p_discount_pct, p_discount_amt, p_total, v_created_at);

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_size_code := NULLIF(trim(v_line->>'size_code'), '');
    v_qty := (v_line->>'qty')::int;

    INSERT INTO sale_lines (sale_id, product_id, size_code, qty, unit_price, line_total, name, sku)
    VALUES (
      v_sale_id,
      v_product_id,
      v_size_code,
      v_qty,
      (v_line->>'unit_price')::numeric,
      (v_line->>'line_total')::numeric,
      NULLIF(trim(v_line->>'name'), ''),
      NULLIF(trim(v_line->>'sku'), '')
    );

    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_product_id;

    IF v_size_kind = 'sized' AND v_size_code IS NOT NULL AND v_size_code != '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = GREATEST(0, quantity - v_qty),
          updated_at = v_created_at
      WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id AND size_code = v_size_code;
    ELSE
      UPDATE warehouse_inventory
      SET quantity = GREATEST(0, quantity - v_qty),
          updated_at = v_created_at
      WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
    END IF;
  END LOOP;

  -- Sync warehouse_inventory.quantity from sum(warehouse_inventory_by_size) for sized products in this sale
  UPDATE warehouse_inventory wi
  SET quantity = COALESCE((
    SELECT SUM(wbs.quantity) FROM warehouse_inventory_by_size wbs
    WHERE wbs.warehouse_id = wi.warehouse_id AND wbs.product_id = wi.product_id
  ), 0),
  updated_at = v_created_at
  WHERE wi.warehouse_id = p_warehouse_id
    AND wi.product_id IN (SELECT product_id FROM sale_lines WHERE sale_id = v_sale_id)
    AND EXISTS (
      SELECT 1 FROM warehouse_products wp
      WHERE wp.id = wi.product_id AND wp.size_kind = 'sized'
    );

  RETURN jsonb_build_object(
    'id', v_sale_id,
    'receiptId', v_receipt_id,
    'createdAt', v_created_at
  );
END;
$$;
