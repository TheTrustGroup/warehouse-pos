-- Seed: Main Store (store + one warehouse "Main Store", code MAIN); Main Town (store + warehouse).
-- Post-merge: one Main Town; one warehouse for Main Store location (MAIN only; DC removed).
-- POS logins (see POS_CREDENTIALS.md):
--   Main Store: cashier@extremedeptkidz.com
--   Main Town:  maintown_cashier@extremedeptkidz.com
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- 1. Ensure store "Main Store" exists
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Store');

-- 2. Warehouse "Main Store" (code MAIN) — single warehouse for Main Store location
INSERT INTO warehouses (id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'MAIN', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAIN');

UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE code = 'MAIN';

-- 3. Store "Main Town"
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Town', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Town');

-- 4. Warehouse "Main Town" (code MAINTOWN)
INSERT INTO warehouses (id, name, code, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Town', 'MAINTOWN', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAINTOWN');

UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main Town' LIMIT 1)
WHERE code = 'MAINTOWN';

-- 5. User scope: Main Store POS — cashier@extremedeptkidz.com (warehouse MAIN only)
INSERT INTO user_scopes (user_email, store_id, warehouse_id, created_at)
SELECT
  'cashier@extremedeptkidz.com',
  s.id,
  w.id,
  now()
FROM stores s
JOIN warehouses w ON w.store_id = s.id AND w.code = 'MAIN'
WHERE s.name = 'Main Store'
  AND NOT EXISTS (
    SELECT 1 FROM user_scopes us
    WHERE us.user_email = 'cashier@extremedeptkidz.com'
      AND us.warehouse_id = w.id
  );

-- 6. User scope: Main Town POS — maintown_cashier@extremedeptkidz.com
INSERT INTO user_scopes (user_email, store_id, warehouse_id, created_at)
SELECT
  'maintown_cashier@extremedeptkidz.com',
  s.id,
  w.id,
  now()
FROM stores s
JOIN warehouses w ON w.code = 'MAINTOWN' AND w.store_id = s.id
WHERE s.name = 'Main Town'
  AND NOT EXISTS (
    SELECT 1 FROM user_scopes us
    WHERE us.user_email = 'maintown_cashier@extremedeptkidz.com'
      AND us.warehouse_id = w.id
  );
