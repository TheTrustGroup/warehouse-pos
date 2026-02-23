-- Resolve "Could not choose the best candidate function between ... p_sold_by => text) ... p_sold_by => uuid)".
-- Drop both 9-param overloads (last param text and uuid), then recreate only the uuid version.

DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, text);
DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid);

CREATE OR REPLACE FUNCTION record_sale(
  p_warehouse_id   uuid,
  p_lines          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_amt   numeric,
  p_total          numeric,
  p_payment_method text,
  p_customer_name  text DEFAULT NULL,
  p_sold_by        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id     uuid := gen_random_uuid();
  v_receipt_id  text;
  v_item_count  int  := 0;
  v_line        jsonb;
  v_product_id  uuid;
  v_size_code   text;
  v_qty         int;
  v_unit_price  numeric;
  v_line_total  numeric;
  v_name        text;
  v_sku         text;
  v_image_url   text;
  v_size_kind   text;
BEGIN
  v_receipt_id := 'RCP-'
    || to_char(now(), 'YYYYMMDD')
    || '-'
    || lpad((nextval('receipt_seq') % 10000)::text, 4, '0');

  INSERT INTO sales (
    id, warehouse_id, customer_name, payment_method,
    subtotal, discount_pct, discount_amt, total,
    receipt_id, status, sold_by, created_at
  ) VALUES (
    v_sale_id, p_warehouse_id, p_customer_name, p_payment_method,
    p_subtotal, p_discount_pct, p_discount_amt, p_total,
    v_receipt_id, 'completed', p_sold_by, now()
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

    INSERT INTO sale_lines (
      sale_id, product_id, size_code,
      name, sku,
      unit_price, qty, line_total,
      product_image_url
    ) VALUES (
      v_sale_id, v_product_id, v_size_code,
      v_name, v_sku,
      v_unit_price, v_qty, v_line_total,
      v_image_url
    );

    SELECT size_kind INTO v_size_kind
    FROM warehouse_products
    WHERE id = v_product_id;

    IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
      UPDATE warehouse_inventory_by_size
      SET
        quantity   = GREATEST(0, quantity - v_qty),
        updated_at = now()
      WHERE
        warehouse_id         = p_warehouse_id
        AND product_id       = v_product_id
        AND upper(size_code) = v_size_code;

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
      UPDATE warehouse_inventory
      SET
        quantity   = GREATEST(0, quantity - v_qty),
        updated_at = now()
      WHERE
        warehouse_id = p_warehouse_id
        AND product_id = v_product_id;
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

GRANT EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid) TO anon;
