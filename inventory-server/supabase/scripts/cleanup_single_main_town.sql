-- One-time cleanup: ensure only one "Main Town" store and one MAINTOWN warehouse.
-- Run in Supabase SQL Editor after phase3 and seeds. Idempotent after first run.

DO $$
DECLARE
  v_keep_store_id   uuid;
  v_keep_warehouse_id uuid;
  v_dup_store_ids   uuid[];
  v_dup_warehouse_ids uuid[];
  v_dup_id          uuid;
BEGIN
  -- 1. Pick the one Main Town store to keep (canonical: min id)
  SELECT id INTO v_keep_store_id
  FROM stores
  WHERE name ILIKE 'Main town'
  ORDER BY id
  LIMIT 1;

  IF v_keep_store_id IS NULL THEN
    RAISE NOTICE 'No Main Town store found; nothing to clean.';
    RETURN;
  END IF;

  -- 2. Pick the one MAINTOWN warehouse to keep
  SELECT id INTO v_keep_warehouse_id
  FROM warehouses
  WHERE code = 'MAINTOWN'
  ORDER BY id
  LIMIT 1;

  IF v_keep_warehouse_id IS NULL THEN
    RAISE NOTICE 'No MAINTOWN warehouse found; nothing to clean.';
    RETURN;
  END IF;

  -- 3. Duplicate store ids (other than kept)
  SELECT ARRAY_AGG(id) INTO v_dup_store_ids
  FROM stores
  WHERE name ILIKE 'Main town' AND id != v_keep_store_id;

  -- 4. Duplicate warehouse ids (other than kept)
  SELECT ARRAY_AGG(id) INTO v_dup_warehouse_ids
  FROM warehouses
  WHERE code = 'MAINTOWN' AND id != v_keep_warehouse_id;

  IF v_dup_warehouse_ids IS NULL AND v_dup_store_ids IS NULL THEN
    RAISE NOTICE 'Already single Main Town store and single MAINTOWN warehouse.';
    -- Still normalize store name and warehouse name
    UPDATE stores SET name = 'Main Town' WHERE id = v_keep_store_id AND name != 'Main Town';
    UPDATE warehouses SET name = 'Main Town', store_id = v_keep_store_id WHERE id = v_keep_warehouse_id;
    RETURN;
  END IF;

  -- 5. Point all MAINTOWN warehouses to the kept store
  UPDATE warehouses
  SET store_id = v_keep_store_id
  WHERE code = 'MAINTOWN';

  -- 6. For each duplicate warehouse: merge inventory into kept, then reassign refs and delete
  IF v_dup_warehouse_ids IS NOT NULL THEN
    FOREACH v_dup_id IN ARRAY v_dup_warehouse_ids
    LOOP
      -- 6a. Merge warehouse_inventory: add quantities for same (product_id), then move rows
      UPDATE warehouse_inventory wi
      SET quantity = wi.quantity + d.quantity
      FROM warehouse_inventory d
      WHERE d.warehouse_id = v_dup_id
        AND wi.warehouse_id = v_keep_warehouse_id
        AND wi.product_id = d.product_id;

      INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
      SELECT v_keep_warehouse_id, d.product_id, d.quantity, d.updated_at
      FROM warehouse_inventory d
      WHERE d.warehouse_id = v_dup_id
        AND NOT EXISTS (
          SELECT 1 FROM warehouse_inventory k
          WHERE k.warehouse_id = v_keep_warehouse_id AND k.product_id = d.product_id
        )
      ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
        quantity = warehouse_inventory.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;

      -- 6b. Merge warehouse_inventory_by_size
      UPDATE warehouse_inventory_by_size wbs
      SET quantity = wbs.quantity + d.quantity
      FROM warehouse_inventory_by_size d
      WHERE d.warehouse_id = v_dup_id
        AND wbs.warehouse_id = v_keep_warehouse_id
        AND wbs.product_id = d.product_id
        AND wbs.size_code = d.size_code;

      INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
      SELECT v_keep_warehouse_id, d.product_id, d.size_code, d.quantity, d.updated_at
      FROM warehouse_inventory_by_size d
      WHERE d.warehouse_id = v_dup_id
        AND NOT EXISTS (
          SELECT 1 FROM warehouse_inventory_by_size k
          WHERE k.warehouse_id = v_keep_warehouse_id AND k.product_id = d.product_id AND k.size_code = d.size_code
        )
      ON CONFLICT (warehouse_id, product_id, size_code) DO UPDATE SET
        quantity = warehouse_inventory_by_size.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at;

      DELETE FROM warehouse_inventory WHERE warehouse_id = v_dup_id;
      DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = v_dup_id;

      -- 6c. Point user_scopes at kept warehouse
      UPDATE user_scopes SET warehouse_id = v_keep_warehouse_id WHERE warehouse_id = v_dup_id;

      -- 6d. Remove duplicate warehouse row
      DELETE FROM warehouses WHERE id = v_dup_id;
    END LOOP;
  END IF;

  -- 7. Point user_scopes and warehouses at kept store; delete duplicate stores
  IF v_dup_store_ids IS NOT NULL THEN
    UPDATE user_scopes SET store_id = v_keep_store_id WHERE store_id = ANY(v_dup_store_ids);
    UPDATE warehouses SET store_id = v_keep_store_id WHERE store_id = ANY(v_dup_store_ids);
    DELETE FROM stores WHERE id = ANY(v_dup_store_ids);
  END IF;

  -- 8. Merge any other "Main Town" warehouse (e.g. code MAIN_TOWN) into the kept MAINTOWN, then delete
  FOR v_dup_id IN
    SELECT id FROM warehouses
    WHERE name ILIKE 'Main town' AND id != v_keep_warehouse_id
  LOOP
    UPDATE warehouse_inventory wi SET quantity = wi.quantity + d.quantity
    FROM warehouse_inventory d
    WHERE d.warehouse_id = v_dup_id AND wi.warehouse_id = v_keep_warehouse_id AND wi.product_id = d.product_id;
    INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    SELECT v_keep_warehouse_id, d.product_id, d.quantity, d.updated_at FROM warehouse_inventory d
    WHERE d.warehouse_id = v_dup_id
      AND NOT EXISTS (SELECT 1 FROM warehouse_inventory k WHERE k.warehouse_id = v_keep_warehouse_id AND k.product_id = d.product_id)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
    UPDATE warehouse_inventory_by_size wbs SET quantity = wbs.quantity + d.quantity
    FROM warehouse_inventory_by_size d
    WHERE d.warehouse_id = v_dup_id AND wbs.warehouse_id = v_keep_warehouse_id AND wbs.product_id = d.product_id AND wbs.size_code = d.size_code;
    INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
    SELECT v_keep_warehouse_id, d.product_id, d.size_code, d.quantity, d.updated_at FROM warehouse_inventory_by_size d
    WHERE d.warehouse_id = v_dup_id
      AND NOT EXISTS (SELECT 1 FROM warehouse_inventory_by_size k WHERE k.warehouse_id = v_keep_warehouse_id AND k.product_id = d.product_id AND k.size_code = d.size_code)
    ON CONFLICT (warehouse_id, product_id, size_code) DO UPDATE SET quantity = warehouse_inventory_by_size.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;
    DELETE FROM warehouse_inventory WHERE warehouse_id = v_dup_id;
    DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = v_dup_id;
    UPDATE user_scopes SET warehouse_id = v_keep_warehouse_id WHERE warehouse_id = v_dup_id;
    DELETE FROM warehouses WHERE id = v_dup_id;
  END LOOP;

  -- 9. Normalize names
  UPDATE stores SET name = 'Main Town' WHERE id = v_keep_store_id;
  UPDATE warehouses SET name = 'Main Town', store_id = v_keep_store_id WHERE id = v_keep_warehouse_id;

  RAISE NOTICE 'Cleanup done: one Main Town store (%), one MAINTOWN warehouse (%).', v_keep_store_id, v_keep_warehouse_id;
END $$;
