-- Trigger: keep warehouse_inventory.quantity in sync with SUM(warehouse_inventory_by_size.quantity).
-- On every INSERT/UPDATE/DELETE on warehouse_inventory_by_size, recompute and set the total for
-- that (warehouse_id, product_id). Eliminates drift at the database level; no app code required.
-- (In this schema the "total" lives in warehouse_inventory, not on warehouse_products.)

CREATE OR REPLACE FUNCTION sync_warehouse_inventory_from_by_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
  v_product_id   uuid;
  v_quantity    int;
BEGIN
  -- Collect (warehouse_id, product_id) to sync: NEW for INSERT/UPDATE, OLD for UPDATE/DELETE.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_warehouse_id := NEW.warehouse_id;
    v_product_id   := NEW.product_id;
    SELECT COALESCE(SUM(quantity), 0)::int INTO v_quantity
    FROM warehouse_inventory_by_size
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
    INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_warehouse_id, v_product_id, v_quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id OR OLD.product_id IS DISTINCT FROM NEW.product_id OR TG_OP = 'DELETE') THEN
    v_warehouse_id := OLD.warehouse_id;
    v_product_id   := OLD.product_id;
    SELECT COALESCE(SUM(quantity), 0)::int INTO v_quantity
    FROM warehouse_inventory_by_size
    WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id;
    INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_warehouse_id, v_product_id, v_quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION sync_warehouse_inventory_from_by_size() IS 'Trigger function: sync warehouse_inventory.quantity from SUM(warehouse_inventory_by_size.quantity) for affected (warehouse_id, product_id).';

-- Post-hardening: revoke from client roles, grant only to service_role (CI invariant).
REVOKE ALL ON FUNCTION public.sync_warehouse_inventory_from_by_size() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_warehouse_inventory_from_by_size() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_warehouse_inventory_from_by_size() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_warehouse_inventory_from_by_size() TO service_role;

DROP TRIGGER IF EXISTS trigger_sync_warehouse_inventory_from_by_size ON warehouse_inventory_by_size;
CREATE TRIGGER trigger_sync_warehouse_inventory_from_by_size
  AFTER INSERT OR UPDATE OR DELETE
  ON warehouse_inventory_by_size
  FOR EACH ROW
  EXECUTE FUNCTION sync_warehouse_inventory_from_by_size();
