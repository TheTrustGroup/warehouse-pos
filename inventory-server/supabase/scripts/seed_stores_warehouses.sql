-- Seed: Main Store + Main Town (stores and warehouses for the warehouse switcher).
-- Run after phase3_stores_and_user_scopes_schema.sql. Idempotent — safe to run multiple times.
-- Leaves user_scopes empty so all logged-in users see all warehouses (unrestricted).

-- 1. Store "Main Store"
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Store');

-- 2. Store "Main Town"
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Town', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Town');

-- 3. First warehouse "Main Store" (code MAIN) if missing, then link to store
INSERT INTO warehouses (id, name, code, created_at, updated_at, store_id)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, 'Main Store', 'MAIN', now(), now(),
       (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAIN');

UPDATE warehouses w
SET store_id = (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE w.code = 'MAIN' AND w.store_id IS NULL;

-- 4. Second warehouse "Main Town" if missing
INSERT INTO warehouses (id, name, code, created_at, updated_at, store_id)
SELECT gen_random_uuid(), 'Main Town', 'MAINTOWN', now(), now(),
       (SELECT id FROM stores WHERE name = 'Main Town' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'MAINTOWN');

UPDATE warehouses w
SET store_id = (SELECT id FROM stores WHERE name = 'Main Town' LIMIT 1)
WHERE w.code = 'MAINTOWN' AND w.store_id IS NULL;
