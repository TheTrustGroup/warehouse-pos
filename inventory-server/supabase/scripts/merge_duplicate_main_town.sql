-- One-time: merge duplicate Main Town (MAIN_TOWN, id 00000002) into canonical Main Town (MAINTOWN, 312ee60a-...), then remove duplicate.
-- Recommendation: MERGE then REMOVE (preserves inventory and user_scopes; avoids data loss).
-- Run in Supabase SQL Editor. Idempotent: safe to run again if duplicate already removed.

DO $$
DECLARE
  v_keep uuid := '312ee60a-9bcb-4a5f-b6ae-59393f716867';
  v_dup  uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = v_dup) THEN
    RAISE NOTICE 'Duplicate Main Town (%) already removed; nothing to do.', v_dup;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = v_keep) THEN
    RAISE EXCEPTION 'Canonical Main Town (%) not found. Do not run until MAINTOWN warehouse exists.', v_keep;
  END IF;

  -- 1. Merge warehouse_inventory: add quantities where same (product_id), insert new rows, then delete from duplicate
  UPDATE warehouse_inventory wi
  SET quantity = wi.quantity + d.quantity, updated_at = GREATEST(wi.updated_at, d.updated_at)
  FROM warehouse_inventory d
  WHERE d.warehouse_id = v_dup
    AND wi.warehouse_id = v_keep
    AND wi.product_id = d.product_id;

  INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
  SELECT v_keep, d.product_id, d.quantity, d.updated_at
  FROM warehouse_inventory d
  WHERE d.warehouse_id = v_dup
    AND NOT EXISTS (SELECT 1 FROM warehouse_inventory k WHERE k.warehouse_id = v_keep AND k.product_id = d.product_id)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
    quantity = warehouse_inventory.quantity + EXCLUDED.quantity,
    updated_at = GREATEST(warehouse_inventory.updated_at, EXCLUDED.updated_at);

  DELETE FROM warehouse_inventory WHERE warehouse_id = v_dup;

  -- 2. Merge warehouse_inventory_by_size
  UPDATE warehouse_inventory_by_size wbs
  SET quantity = wbs.quantity + d.quantity, updated_at = GREATEST(wbs.updated_at, d.updated_at)
  FROM warehouse_inventory_by_size d
  WHERE d.warehouse_id = v_dup
    AND wbs.warehouse_id = v_keep
    AND wbs.product_id = d.product_id
    AND wbs.size_code = d.size_code;

  INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
  SELECT v_keep, d.product_id, d.size_code, d.quantity, d.updated_at
  FROM warehouse_inventory_by_size d
  WHERE d.warehouse_id = v_dup
    AND NOT EXISTS (
      SELECT 1 FROM warehouse_inventory_by_size k
      WHERE k.warehouse_id = v_keep AND k.product_id = d.product_id AND k.size_code = d.size_code
    )
  ON CONFLICT (warehouse_id, product_id, size_code) DO UPDATE SET
    quantity = warehouse_inventory_by_size.quantity + EXCLUDED.quantity,
    updated_at = GREATEST(warehouse_inventory_by_size.updated_at, EXCLUDED.updated_at);

  DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = v_dup;

  -- 3. Point user_scopes at canonical Main Town
  UPDATE user_scopes SET warehouse_id = v_keep WHERE warehouse_id = v_dup;

  -- 4. Remove duplicate warehouse row
  DELETE FROM warehouses WHERE id = v_dup;

  RAISE NOTICE 'Merged duplicate Main Town (%) into canonical (%). Duplicate removed.', v_dup, v_keep;
END $$;
