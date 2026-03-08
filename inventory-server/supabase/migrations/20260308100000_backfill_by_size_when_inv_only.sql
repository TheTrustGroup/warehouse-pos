-- Data integrity: when warehouse_inventory has quantity but no warehouse_inventory_by_size rows,
-- backfill one row with size_code from product: 'NA' for size_kind = 'na', 'OS' otherwise.
-- Respects enforce_size_policy (only NA allowed for na products).
-- Prerequisite: size codes 'NA' and 'OS' exist (seed in 20250211000000_size_codes_and_inventory_by_size.sql).

CREATE OR REPLACE FUNCTION backfill_by_size_from_inv_when_empty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size_code text;
BEGIN
  IF NEW.quantity > 0 AND NOT EXISTS (
    SELECT 1 FROM warehouse_inventory_by_size
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id
  ) THEN
    SELECT CASE WHEN COALESCE(size_kind, 'na') = 'na' THEN 'NA' ELSE 'OS' END INTO v_size_code
    FROM warehouse_products WHERE id = NEW.product_id;
    v_size_code := COALESCE(v_size_code, 'OS');
    INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
    VALUES (NEW.warehouse_id, NEW.product_id, v_size_code, NEW.quantity, now())
    ON CONFLICT (warehouse_id, product_id, size_code)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION backfill_by_size_from_inv_when_empty() IS 'Trigger: when warehouse_inventory has qty but no by_size rows, insert one row (size_code NA for na products, OS otherwise) so both sources match and UI shows quantity.';

REVOKE ALL ON FUNCTION public.backfill_by_size_from_inv_when_empty() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_by_size_from_inv_when_empty() TO service_role;

DROP TRIGGER IF EXISTS trigger_backfill_by_size_from_inv ON warehouse_inventory;
CREATE TRIGGER trigger_backfill_by_size_from_inv
  AFTER INSERT OR UPDATE OF quantity
  ON warehouse_inventory
  FOR EACH ROW
  EXECUTE FUNCTION backfill_by_size_from_inv_when_empty();
