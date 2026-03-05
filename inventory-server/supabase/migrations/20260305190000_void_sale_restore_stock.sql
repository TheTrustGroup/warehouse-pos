-- void_sale: set sale to voided and restore stock from sale_lines (sized and non-sized).
-- POST /api/sales/void calls this so inventory returns when a sale is voided.

CREATE OR REPLACE FUNCTION void_sale(p_sale_id uuid)
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
  SELECT warehouse_id, status INTO v_warehouse_id, v_status
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'voided' THEN
    RETURN; /* idempotent: already voided, do not double-restore stock */
  END IF;

  FOR v_line IN
    SELECT sl.product_id, sl.size_code, sl.qty
    FROM sale_lines sl
    WHERE sl.sale_id = p_sale_id
  LOOP
    SELECT size_kind INTO v_size_kind
    FROM warehouse_products WHERE id = v_line.product_id;

    IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) <> '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = quantity + v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id
        AND product_id   = v_line.product_id
        AND size_code    = v_line.size_code;

      UPDATE warehouse_inventory
      SET quantity = (
        SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
        WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id
      ), updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    ELSE
      UPDATE warehouse_inventory
      SET quantity = quantity + v_line.qty, updated_at = now()
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    END IF;
  END LOOP;

  UPDATE sales SET status = 'voided' WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION void_sale(uuid) IS 'Void a completed sale: restore stock from sale_lines then set status to voided. Idempotent if already voided.';

REVOKE ALL ON FUNCTION void_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_sale(uuid) TO service_role;
