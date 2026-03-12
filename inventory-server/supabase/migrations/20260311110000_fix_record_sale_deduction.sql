-- Fix record_sale so inventory is always deducted on direct sales:
-- 1) Case-insensitive size_code matching (DB may store 'One Size', frontend sends uppercased).
-- 2) When size_kind = 'sized' but sizeCode is null (one-size product), deduct from the single by_size row.

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
  v_sale_id           uuid := gen_random_uuid();
  v_receipt_id        text;
  v_item_count        int  := 0;
  v_line              jsonb;
  v_product_id         uuid;
  v_size_code         text;
  v_qty               int;
  v_unit_price        numeric;
  v_line_total        numeric;
  v_name              text;
  v_sku               text;
  v_image_url         text;
  v_size_kind         text;
  v_current_qty        int;
  v_reserved_qty      int;
  v_cost_price        numeric;
  v_is_delivery       boolean;
  v_single_size_code  text;   -- for one-size when sizeCode is null
  v_size_row_count     int;
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
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
          AND upper(trim(size_code)) = v_size_code
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
      INSERT INTO sale_lines (
        id, sale_id, product_id, size_code, product_name, product_sku,
        unit_price, qty, line_total, product_image_url, cost_price, created_at
      ) VALUES (
        gen_random_uuid(), v_sale_id, v_product_id, v_size_code, v_name, v_sku,
        v_unit_price, v_qty, v_line_total, v_image_url, v_cost_price, now()
      );
    ELSE
      -- Direct sale: deduct immediately
      IF v_size_kind = 'sized' AND v_size_code IS NOT NULL THEN
        -- Sized product with size selected: case-insensitive match
        SELECT quantity INTO v_current_qty
        FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
          AND upper(trim(size_code)) = v_size_code
        FOR UPDATE;
        IF NOT FOUND OR v_current_qty IS NULL THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        IF v_current_qty < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        UPDATE warehouse_inventory_by_size
        SET quantity = quantity - v_qty, updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
          AND upper(trim(size_code)) = v_size_code;
        UPDATE warehouse_inventory
        SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
                        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id),
            updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
      ELSIF v_size_kind = 'sized' AND v_size_code IS NULL THEN
        -- One-size product (sizeCode not sent): deduct from the single by_size row if exactly one
        SELECT count(*) INTO v_size_row_count
        FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
        IF v_size_row_count = 0 THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        IF v_size_row_count > 1 THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK: size required for multi-size product' USING ERRCODE = 'P0001';
        END IF;
        SELECT size_code, quantity INTO v_single_size_code, v_current_qty
        FROM warehouse_inventory_by_size
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id
        FOR UPDATE;
        IF v_current_qty < v_qty THEN
          RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
        END IF;
        UPDATE warehouse_inventory_by_size
        SET quantity = quantity - v_qty, updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
        UPDATE warehouse_inventory
        SET quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
                        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id),
            updated_at = now()
        WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
        v_size_code := v_single_size_code;  -- for sale_lines.size_code
      ELSE
        -- Non-sized: deduct from warehouse_inventory
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
  'Record sale: direct sale = deduct stock now (case-insensitive size; one-size supported with null sizeCode); delivery sale = reserve only.';

-- complete_delivery and void_sale: case-insensitive size_code match so they match the rows record_sale updated
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
    RETURN;
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
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id
        AND upper(trim(size_code)) = upper(trim(v_line.size_code));
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

CREATE OR REPLACE FUNCTION void_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id     uuid;
  v_status           text;
  v_delivery_status  text;
  v_line             record;
  v_size_kind        text;
  v_has_reservations boolean;
BEGIN
  SELECT warehouse_id, status, delivery_status INTO v_warehouse_id, v_status, v_delivery_status
  FROM sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'voided' THEN
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM sale_reservations WHERE sale_id = p_sale_id LIMIT 1) INTO v_has_reservations;

  IF v_has_reservations THEN
    DELETE FROM sale_reservations WHERE sale_id = p_sale_id;
    UPDATE sales SET status = 'voided' WHERE id = p_sale_id;
    RETURN;
  END IF;

  FOR v_line IN
    SELECT sl.product_id, sl.size_code, sl.qty
    FROM sale_lines sl WHERE sl.sale_id = p_sale_id
  LOOP
    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_line.product_id;

    IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) <> '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = quantity + v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id
        AND upper(trim(size_code)) = upper(trim(v_line.size_code));
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
