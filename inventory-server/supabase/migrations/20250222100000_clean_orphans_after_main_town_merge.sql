-- Post-merge cleanup: remove rows that reference warehouses that no longer exist.
-- After merging/removing one Main Town, orphaned warehouse_id references must be removed
-- so inventory and user_scopes stay consistent with the warehouses table.
-- Safe to run: only deletes rows whose warehouse_id is not in warehouses.
-- Idempotent.

-- 1. Orphaned per-size inventory (warehouse_inventory_by_size)
DELETE FROM warehouse_inventory_by_size
WHERE warehouse_id NOT IN (SELECT id FROM warehouses);

-- 2. Orphaned warehouse-level inventory (warehouse_inventory)
DELETE FROM warehouse_inventory
WHERE warehouse_id NOT IN (SELECT id FROM warehouses);

-- 3. Orphaned user_scopes (scope pointed at removed warehouse)
DELETE FROM user_scopes
WHERE warehouse_id IS NOT NULL
  AND warehouse_id NOT IN (SELECT id FROM warehouses);
