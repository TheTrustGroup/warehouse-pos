-- ============================================================
-- ADD_SALE_VOID.sql
-- Run in: Supabase Dashboard → SQL Editor (after DELIVERY_MIGRATION and ADD_DELIVERY_CANCELLED).
--
-- Full order cancellation (void): restore stock and mark sale as voided.
-- Adds voided_at, voided_by to sales and RPC void_sale(sale_id, voided_by).
-- ============================================================

-- Add void columns to sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS voided_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by   text;

-- RPC: void_sale(p_sale_id uuid, p_voided_by text)
-- Restores stock for each line (sized → warehouse_inventory_by_size; else warehouse_inventory),
-- syncs warehouse_inventory from by_size for sized products, sets sales.voided_at and voided_by.
CREATE OR REPLACE FUNCTION void_sale(p_sale_id uuid, p_voided_by text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_voided_at timestamptz := now();
  v_line record;
  v_size_kind text;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id FROM sales WHERE id = p_sale_id;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND: sale % does not exist', p_sale_id;
  END IF;
  IF EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id AND voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'SALE_ALREADY_VOIDED: sale % is already voided', p_sale_id;
  END IF;

  FOR v_line IN
    SELECT sl.product_id, sl.size_code, sl.qty
    FROM sale_lines sl
    WHERE sl.sale_id = p_sale_id
  LOOP
    SELECT size_kind INTO v_size_kind FROM warehouse_products WHERE id = v_line.product_id;

    IF v_size_kind = 'sized' AND v_line.size_code IS NOT NULL AND trim(v_line.size_code) != '' THEN
      UPDATE warehouse_inventory_by_size
      SET quantity = quantity + v_line.qty,
          updated_at = v_voided_at
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id
        AND upper(trim(size_code)) = upper(trim(v_line.size_code));
    ELSE
      UPDATE warehouse_inventory
      SET quantity = quantity + v_line.qty,
          updated_at = v_voided_at
      WHERE warehouse_id = v_warehouse_id AND product_id = v_line.product_id;
    END IF;
  END LOOP;

  -- Sync warehouse_inventory.quantity from sum(warehouse_inventory_by_size) for sized products in this sale
  UPDATE warehouse_inventory wi
  SET quantity = COALESCE((
    SELECT SUM(wbs.quantity) FROM warehouse_inventory_by_size wbs
    WHERE wbs.warehouse_id = wi.warehouse_id AND wbs.product_id = wi.product_id
  ), wi.quantity),
  updated_at = v_voided_at
  WHERE wi.warehouse_id = v_warehouse_id
    AND wi.product_id IN (SELECT product_id FROM sale_lines WHERE sale_id = p_sale_id)
    AND EXISTS (
      SELECT 1 FROM warehouse_products wp
      WHERE wp.id = wi.product_id AND wp.size_kind = 'sized'
    );

  UPDATE sales
  SET voided_at = v_voided_at,
      voided_by = NULLIF(trim(p_voided_by), '')
  WHERE id = p_sale_id;
END;
$$;

COMMENT ON FUNCTION void_sale(uuid, text) IS 'Void a sale: restore stock and set voided_at. Idempotent check: raises if already voided.';
