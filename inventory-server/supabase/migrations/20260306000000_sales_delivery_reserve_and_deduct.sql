-- Sales delivery: reserve stock for scheduled delivery until delivered; direct sales deduct immediately.
-- Void sale: return stock to inventory (release reservations or restore deducted).
-- 1) Add delivery columns to sales
-- 2) sale_reservations table for delivery sales (reserve until delivered)
-- 3) record_sale: add p_delivery_schedule; if set → reserve only; else → deduct (direct)
-- 4) complete_delivery(sale_id): deduct from stock, delete reservations, set delivered
-- 5) release_delivery_reservations(sale_id): cancel delivery, release reservations
-- 6) void_sale: if reserved → release reservations; if deducted → restore stock

-- 1) Delivery columns on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_schedule jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status   text,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz;

COMMENT ON COLUMN sales.delivery_schedule IS 'When set, sale is for scheduled delivery: stock is reserved, not deducted until delivery completed.';
COMMENT ON COLUMN sales.delivery_status IS 'pending | dispatched | delivered | cancelled. Null = direct sale (no delivery).';
COMMENT ON COLUMN sales.delivered_at IS 'When delivery was marked delivered (outbound).';

-- Allow delivery_status values
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_delivery_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'dispatched', 'delivered', 'cancelled'));

-- 2) Reservations: one row per (sale, product, size) for delivery sales
CREATE TABLE IF NOT EXISTS sale_reservations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  product_id  uuid NOT NULL REFERENCES warehouse_products(id),
  size_code   text,
  qty         int NOT NULL CHECK (qty > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_reservations_sale_product_size
  ON sale_reservations(sale_id, product_id, COALESCE(size_code, ''));
CREATE INDEX IF NOT EXISTS idx_sale_reservations_warehouse_product
  ON sale_reservations(warehouse_id, product_id, COALESCE(size_code, ''));

COMMENT ON TABLE sale_reservations IS 'Reserved qty for delivery sales. Deducted when delivery is marked delivered; released when delivery cancelled or sale voided.';

-- Drop old 10-param record_sale so only 11-param (with p_delivery_schedule) exists
DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text);

-- 3) record_sale: add p_delivery_schedule; reserve vs deduct
CREATE OR REPLACE FUNCTION record_sale(
  p_warehouse_id    uuid,
  p_lines           jsonb,
  p_subtotal        numeric,
  p_discount_pct    numeric,
  p_discount_amt    numeric,
  p_total           numeric,
  p_payment_method  text,
  p_customer_name   text DEFAULT NULL,
  p_sold_by         uuid DEFAULT NULL,
  p_sold_by_email   text DEFAULT NULL,
  p_delivery_schedule jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id       uuid := gen_random_uuid();
  v_receipt_id    text;
  v_item_count    int  := 0;
  v_line          jsonb;
  v_product_id    uuid;
  v_size_code     text;
  v_qty           int;
  v_unit_price    numeric;
  v_line_total    numeric;
  v_name          text;
  v_sku           text;
  v_image_url     text;
  v_size_kind     text;
  v_current_qty   int;
  v_reserved_qty  int;
  v_cost_price    numeric;
  v_is_delivery   boolean;
BEGIN
  v_is_delivery := (p_delivery_schedule IS NOT NULL AND jsonb_typeof(p_delivery_schedule) = 'object');

  v_receipt_id := 'RCP-'
    || to_char(now(), 'YYYYMMDD')
    || '-'
    || lpad((nextval('receipt_seq') % 10000)::text, 4, '0');

  INSERT INTO sales (
    id, warehouse_id, customer_name, payment_method,
    subtotal, discount_pct, discount_amt, total,
    receipt_id, status, sold_by, sold_by_email, created_at,
    delivery_schedule, delivery_status
  ) VALUES (
    v_sale_id, p_warehouse_id, p_customer_name, p_payment_method,
    p_subtotal, p_discount_pct, p_discount_amt, p_total,
    v_receipt_id, 'completed', p_sold_by, p_sold_by_email, now(),
    CASE WHEN v_is_delivery THEN p_delivery_schedule ELSE NULL END,
    CASE WHEN v_is_delivery THEN 'pending'::text ELSE NULL END
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'productId')::uuid;
    v_size_code  := NULLIF(trim(upper(v_line->>'sizeCode')), '');
    v_qty        := GREATEST(1, (v_line->>'qty')::int);
    v_unit_price := COALESCE((v_line->>'unitPrice')::numeric, 0);
    v_line_total := COALESCE((v_line->>'lineTotal')::numeric, v_unit_price * v_qty);
    v_name       := COALESCE(v_line->>'name', 'Unknown');
    v_sku        := COALESCE(v_line->>'sku', '');
    v_image_url  := NULLIF(trim(v_line->>'imageUrl'), '');
    v_item_count := v_item_count + v_qty;

    SELECT cost_price INTO v_cost_price FROM warehouse_products WHERE id = v_product_id;
    v_cost_price := COALESCE(v_cost_price, 0);
    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_product_id;

    IF v_is_delivery THEN
      -- Scheduled delivery: reserve (check available = quantity - reserved >= qty)
      IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
        SELECT COALESCE(quantity, 0) INTO v_current_qty
        FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id AND size_code = v_size_code
        FOR UPDATE;
        IF NOT FOUND OR v_current_qty IS NULL THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        SELECT COALESCE(SUM(sr.qty), 0)::int INTO v_reserved_qty
        FROM sale_reservations sr
        WHERE sr.warehouse_id = p_warehouse_id AND sr.product_id = v_product_id
          AND upper(trim(COALESCE(sr.size_code, ''))) = v_size_code;
        IF (v_current_qty - v_reserved_qty) < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        INSERT INTO sale_reservations (sale_id, warehouse_id, product_id, size_code, qty)
        VALUES (v_sale_id, p_warehouse_id, v_product_id, v_size_code, v_qty);
      ELSE
        SELECT COALESCE(quantity, 0) INTO v_current_qty
        FROM warehouse_inventory
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
        FOR UPDATE;
        IF NOT FOUND OR v_current_qty IS NULL THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        SELECT COALESCE(SUM(sr.qty), 0)::int INTO v_reserved_qty
        FROM sale_reservations sr
        WHERE sr.warehouse_id = p_warehouse_id AND sr.product_id = v_product_id
          AND (sr.size_code IS NULL OR trim(sr.size_code) = '');
        IF (v_current_qty - v_reserved_qty) < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        INSERT INTO sale_reservations (sale_id, warehouse_id, product_id, size_code, qty)
        VALUES (v_sale_id, p_warehouse_id, v_product_id, NULL, v_qty);
      END IF;
      -- Insert sale_line (no stock change)
      INSERT INTO sale_lines (
        id, sale_id, product_id, size_code, product_name, product_sku,
        unit_price, qty, line_total, product_image_url, cost_price, created_at
      ) VALUES (
        gen_random_uuid(), v_sale_id, v_product_id, v_size_code, v_name, v_sku,
        v_unit_price, v_qty, v_line_total, v_image_url, v_cost_price, now()
      );
    ELSE
      -- Direct sale: deduct immediately (existing logic)
      IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
        SELECT quantity INTO v_current_qty
        FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id AND size_code = v_size_code
        FOR UPDATE;
        IF NOT FOUND OR v_current_qty IS NULL THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        IF v_current_qty < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        UPDATE warehouse_inventory_by_size
        SET quantity = quantity - v_qty, updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id AND size_code = v_size_code;
        UPDATE warehouse_inventory
        SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
                        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id),
            updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
      ELSE
        SELECT quantity INTO v_current_qty
        FROM warehouse_inventory
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
        FOR UPDATE;
        IF NOT FOUND OR v_current_qty IS NULL THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        IF v_current_qty < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        UPDATE warehouse_inventory
        SET quantity = quantity - v_qty, updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
      END IF;
      INSERT INTO sale_lines (
        id, sale_id, product_id, size_code, product_name, product_sku,
        unit_price, qty, line_total, product_image_url, cost_price, created_at
      ) VALUES (
        gen_random_uuid(), v_sale_id, v_product_id, v_size_code, v_name, v_sku,
        v_unit_price, v_qty, v_line_total, v_image_url, v_cost_price, now()
      );
    END IF;
  END LOOP;

  UPDATE sales SET item_count = v_item_count WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'id',         v_sale_id,
    'receiptId',  v_receipt_id,
    'total',      p_total,
    'itemCount',  v_item_count,
    'status',     'completed',
    'createdAt',  now()
  );
END;
$$;

COMMENT ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) IS
  'Record sale: direct sale = deduct stock now; delivery sale (p_delivery_schedule set) = reserve only, deduct when delivery completed.';

REVOKE ALL ON FUNCTION public.record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) TO service_role;

-- 4) complete_delivery(sale_id): deduct reserved stock, delete reservations, set delivered
CREATE OR REPLACE FUNCTION complete_delivery(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_status       text;
  v_line         record;
  v_size_kind    text;
BEGIN
  SELECT warehouse_id, delivery_status INTO v_warehouse_id, v_status
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Sale is not a delivery sale' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'delivered' THEN
    RETURN; /* idempotent */
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot mark cancelled delivery as delivered' USING ERRCODE = 'P0001';
  END IF;

  FOR v_line IN
    SELECT sl.product_id, sl.size_code, sl.qty
    FROM sale_lines sl WHERE sl.sale_id = p_sale_id
  LOOP
    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_line.product_id;

    IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) <> '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = quantity - v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id AND size_code = v_line.size_code;
      UPDATE warehouse_inventory
      SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
                      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id),
          updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    ELSE
      UPDATE warehouse_inventory
      SET quantity = quantity - v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    END IF;
  END LOOP;

  DELETE FROM sale_reservations WHERE sale_id = p_sale_id;
  UPDATE sales SET delivery_status = 'delivered', delivered_at = now() WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION complete_delivery(uuid) IS 'Mark delivery as delivered: deduct reserved stock and clear reservations.';

REVOKE ALL ON FUNCTION public.complete_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid) TO service_role;

-- 5) release_delivery_reservations(sale_id): cancel delivery, release reservations
CREATE OR REPLACE FUNCTION release_delivery_reservations(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT delivery_status INTO v_status FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'delivered' THEN
    RAISE EXCEPTION 'Cannot cancel already delivered sale' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM sale_reservations WHERE sale_id = p_sale_id;
  UPDATE sales SET delivery_status = 'cancelled' WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION release_delivery_reservations(uuid) IS 'Cancel delivery: release reserved stock.';

REVOKE ALL ON FUNCTION public.release_delivery_reservations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_delivery_reservations(uuid) TO service_role;

-- 6) void_sale: if reserved (delivery not completed) → release reservations; else → restore stock
CREATE OR REPLACE FUNCTION void_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_status       text;
  v_delivery_status text;
  v_line         record;
  v_size_kind    text;
  v_has_reservations boolean;
BEGIN
  SELECT warehouse_id, status, delivery_status INTO v_warehouse_id, v_status, v_delivery_status
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'voided' THEN
    RETURN; /* idempotent */
  END IF;

  SELECT EXISTS (SELECT 1 FROM sale_reservations WHERE sale_id = p_sale_id LIMIT 1) INTO v_has_reservations;

  IF v_has_reservations THEN
    -- Delivery sale that was never delivered: release reservations only
    DELETE FROM sale_reservations WHERE sale_id = p_sale_id;
    UPDATE sales SET status = 'voided' WHERE id = p_sale_id;
    RETURN;
  END IF;

  -- Direct sale or delivered delivery: stock was deducted; restore it
  FOR v_line IN
    SELECT sl.product_id, sl.size_code, sl.qty
    FROM sale_lines sl WHERE sl.sale_id = p_sale_id
  LOOP
    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_line.product_id;

    IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) <> '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = quantity + v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id AND size_code = v_line.size_code;
      UPDATE warehouse_inventory
      SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
                      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id),
          updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    ELSE
      UPDATE warehouse_inventory
      SET quantity = quantity + v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    END IF;
  END LOOP;

  UPDATE sales SET status = 'voided', stock_restored_at = now() WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION void_sale(uuid) IS 'Void sale: release reservations if delivery not completed; otherwise restore stock to inventory. Idempotent if already voided.';

REVOKE ALL ON FUNCTION public.void_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_sale(uuid) TO service_role;
