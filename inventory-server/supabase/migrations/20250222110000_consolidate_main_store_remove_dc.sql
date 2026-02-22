-- Consolidate Main Store location into a single warehouse: keep MAIN ("Main Store"), remove DC.
-- DC and Main Store are the same location; merge DC inventory into MAIN, then delete DC and all references.
-- Idempotent: if DC does not exist, no-op. Run once after seed has created both MAIN and DC.

-- 1. Ensure MAIN warehouse exists and is linked to Main Store (in case only DC existed)
INSERT INTO warehouses (id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'MAIN', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAIN');

UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE code = 'MAIN';

-- 2. Merge warehouse_inventory_by_size: DC quantities into MAIN (sum on conflict)
INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
SELECT
  (SELECT id FROM warehouses WHERE code = 'MAIN' LIMIT 1),
  product_id,
  size_code,
  quantity,
  now()
FROM warehouse_inventory_by_size
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'DC' LIMIT 1)
ON CONFLICT (warehouse_id, product_id, size_code)
DO UPDATE SET
  quantity = warehouse_inventory_by_size.quantity + EXCLUDED.quantity,
  updated_at = now();

-- 3. Merge warehouse_inventory: DC quantities into MAIN (sum on conflict)
INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
SELECT
  (SELECT id FROM warehouses WHERE code = 'MAIN' LIMIT 1),
  product_id,
  quantity,
  now()
FROM warehouse_inventory
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'DC' LIMIT 1)
ON CONFLICT (warehouse_id, product_id)
DO UPDATE SET
  quantity = warehouse_inventory.quantity + EXCLUDED.quantity,
  updated_at = now();

-- 4. Remove DC: user_scopes, then inventory, then warehouse row
DELETE FROM user_scopes
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'DC' LIMIT 1);

DELETE FROM warehouse_inventory_by_size
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'DC' LIMIT 1);

DELETE FROM warehouse_inventory
WHERE warehouse_id = (SELECT id FROM warehouses WHERE code = 'DC' LIMIT 1);

DELETE FROM warehouses
WHERE code = 'DC';
