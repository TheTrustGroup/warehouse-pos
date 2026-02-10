-- Seed: Main Store (store) + DC (its warehouse); Main town (store + warehouse).
-- One POS uses DC + Main Store; a different POS uses Main town only.
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- 1. Ensure store "Main Store" exists (may already exist from phase3)
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Store');

-- 2. Warehouse DC (Main Store's warehouse) — create if missing
INSERT INTO warehouses (id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), 'DC', 'DC', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'DC');

UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE code = 'DC';

-- Optional: unlink MAIN from Main Store so only DC is Main Store's warehouse (uncomment if you want)
-- UPDATE warehouses SET store_id = NULL WHERE code = 'MAIN';

-- 3. Store "Main town" (does store sales)
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main town', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main town');

-- 4. Warehouse "Main town" (same location, does store sales)
INSERT INTO warehouses (id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), 'Main town', 'MAINTOWN', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAINTOWN');

UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main town' LIMIT 1)
WHERE code = 'MAINTOWN';

-- 5. User scope: POS that uses DC + Main Store (same POS for both)
--    Replace the email with the login used on that device.
INSERT INTO user_scopes (user_email, store_id, warehouse_id, created_at)
SELECT
  'cashier@extremedeptkidz.com',
  s.id,
  w.id,
  now()
FROM stores s
JOIN warehouses w ON w.store_id = s.id AND w.code = 'DC'
WHERE s.name = 'Main Store'
  AND NOT EXISTS (
    SELECT 1 FROM user_scopes us
    WHERE us.user_email = 'cashier@extremedeptkidz.com'
      AND us.warehouse_id = w.id
  );

-- 6. User scope: POS that uses only Main town (different POS)
--    Replace the email with the login used on the Main town device.
INSERT INTO user_scopes (user_email, store_id, warehouse_id, created_at)
SELECT
  'maintown@extremedeptkidz.com',
  s.id,
  w.id,
  now()
FROM stores s
JOIN warehouses w ON w.code = 'MAINTOWN' AND w.store_id = s.id
WHERE s.name = 'Main town'
  AND NOT EXISTS (
    SELECT 1 FROM user_scopes us
    WHERE us.user_email = 'maintown@extremedeptkidz.com'
      AND us.warehouse_id = w.id
  );
