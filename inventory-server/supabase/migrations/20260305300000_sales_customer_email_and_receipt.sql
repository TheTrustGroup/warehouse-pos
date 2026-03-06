-- Add customer_email to sales for receipt email (NEXT 1 — Sale Receipt Email).
-- Only send receipt when customer_email is provided; store it on the sale for the Edge Function.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'customer_email'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_email text;
  END IF;
END $$;

COMMENT ON COLUMN sales.customer_email IS 'Optional email for sending receipt; Edge Function send-receipt only runs when present.';

-- Recreate record_sale with p_customer_email (11th param). Same logic as 20260305140000 + customer_email in INSERT.
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
  p_customer_email  text DEFAULT NULL
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
  v_cost_price    numeric;
BEGIN
  v_receipt_id := 'RCP-'
    || to_char(now(), 'YYYYMMDD')
    || '-'
    || lpad((nextval('receipt_seq') % 10000)::text, 4, '0');

  INSERT INTO sales (
    id, warehouse_id, customer_name, customer_email, payment_method,
    subtotal, discount_pct, discount_amt, total,
    receipt_id, status, sold_by, sold_by_email, created_at
  ) VALUES (
    v_sale_id, p_warehouse_id, p_customer_name, p_customer_email, p_payment_method,
    p_subtotal, p_discount_pct, p_discount_amt, p_total,
    v_receipt_id, 'completed', p_sold_by, p_sold_by_email, now()
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

    SELECT cost_price INTO v_cost_price
    FROM warehouse_products WHERE id = v_product_id;
    v_cost_price := COALESCE(v_cost_price, 0);

    SELECT size_kind INTO v_size_kind
    FROM warehouse_products WHERE id = v_product_id;

    IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
      SELECT quantity INTO v_current_qty
      FROM warehouse_inventory_by_size
      WHERE warehouse_id = p_warehouse_id
        AND product_id = v_product_id
        AND size_code = v_size_code
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
      SET quantity = (
        SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
      ), updated_at = now()
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

COMMENT ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, text) IS
  'Record sale + lines (with cost_price) + deduct stock. customer_email optional for receipt; sold_by_email = cashier.';

-- Drop the 10-param overload so API calls resolve to the 11-param version.
DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text);

REVOKE ALL ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, text) TO service_role;
