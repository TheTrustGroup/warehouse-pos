-- Restore stock for sales that were voided before void_sale RPC existed (stock was never returned).
-- 1) Add stock_restored_at so we can mark which voided sales have had stock restored.
-- 2) Backfill: restore stock for all sales where status = 'voided' AND stock_restored_at IS NULL.
-- 3) Update void_sale to set stock_restored_at when it restores and voids.

-- Add column
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

COMMENT ON COLUMN sales.stock_restored_at IS 'Set when stock was returned for this sale (void). Used to avoid double-restore and to backfill pre-void_sale voided sales.';

-- Backfill: restore stock for every sale that is voided but never had stock restored
DO $$
DECLARE
  v_sale     record;
  v_line     record;
  v_size_kind text;
BEGIN
  FOR v_sale IN
    SELECT id, warehouse_id
    FROM sales
    WHERE status = 'voided' AND stock_restored_at IS NULL
    FOR UPDATE
  LOOP
    FOR v_line IN
      SELECT sl.product_id, sl.size_code, sl.qty
      FROM sale_lines sl
      WHERE sl.sale_id = v_sale.id
    LOOP
      SELECT size_kind INTO v_size_kind
      FROM warehouse_products WHERE id = v_line.product_id;

      IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) <> '' THEN
        UPDATE warehouse_inventory_by_size
        SET quantity = quantity + v_line.qty, updated_at = now()
        WHERE warehouse_id = v_sale.warehouse_id
          AND product_id   = v_line.product_id
          AND size_code    = v_line.size_code;

        UPDATE warehouse_inventory
        SET quantity = (
          SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size
          WHERE warehouse_id = v_sale.warehouse_id AND product_id = v_line.product_id
        ), updated_at = now()
        WHERE warehouse_id = v_sale.warehouse_id AND product_id = v_line.product_id;
      ELSE
        UPDATE warehouse_inventory
        SET quantity = quantity + v_line.qty, updated_at = now()
        WHERE warehouse_id = v_sale.warehouse_id AND product_id = v_line.product_id;
      END IF;
    END LOOP;

    UPDATE sales SET stock_restored_at = now() WHERE id = v_sale.id;
  END LOOP;
END;
$$;

-- Update void_sale to set stock_restored_at when it restores and voids
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

  UPDATE sales SET status = 'voided', stock_restored_at = now() WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION void_sale(uuid) IS 'Void a completed sale: restore stock from sale_lines then set status to voided. Idempotent if already voided.';

REVOKE ALL ON FUNCTION void_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_sale(uuid) TO service_role;
