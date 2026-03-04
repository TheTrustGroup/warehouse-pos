-- Mixed payment: store breakdown (method + amount) per sale for reporting and receipts.
-- POST /api/sales sends payments array when paymentMethod = 'mixed'; record_sale persists it.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'payments_breakdown'
  ) THEN
    ALTER TABLE sales ADD COLUMN payments_breakdown jsonb;
  END IF;
END $$;

COMMENT ON COLUMN sales.payments_breakdown IS 'For payment_method = mixed: array of { method, amount } per leg.';

-- Replace record_sale with 11-param version (p_payments_breakdown optional). Drop old overload so only one exists.
DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text);

CREATE OR REPLACE FUNCTION record_sale(
  p_warehouse_id       uuid,
  p_lines              jsonb,
  p_subtotal           numeric,
  p_discount_pct       numeric,
  p_discount_amt        numeric,
  p_total              numeric,
  p_payment_method     text,
  p_customer_name       text DEFAULT NULL,
  p_sold_by            uuid DEFAULT NULL,
  p_sold_by_email      text DEFAULT NULL,
  p_payments_breakdown jsonb DEFAULT NULL
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
  v_current_qty    int;
BEGIN
  v_receipt_id := 'RCP-'
    || to_char(now(), 'YYYYMMDD')
    || '-'
    || lpad((nextval('receipt_seq') % 10000)::text, 4, '0');

  INSERT INTO sales (
    id, warehouse_id, customer_name, payment_method,
    subtotal, discount_pct, discount_amt, total,
    receipt_id, status, sold_by, sold_by_email, payments_breakdown, created_at
  ) VALUES (
    v_sale_id, p_warehouse_id, p_customer_name, p_payment_method,
    p_subtotal, p_discount_pct, p_discount_amt, p_total,
    v_receipt_id, 'completed', p_sold_by, p_sold_by_email, p_payments_breakdown, now()
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
      unit_price, qty, line_total, product_image_url, created_at
    ) VALUES (
      gen_random_uuid(), v_sale_id, v_product_id, v_size_code, v_name, v_sku,
      v_unit_price, v_qty, v_line_total, v_image_url, now()
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

COMMENT ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) IS
  'Record sale + lines + deduct stock atomically. payments_breakdown: optional array of { method, amount } for mixed payments.';

REVOKE ALL ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb) TO service_role;
