-- Phase 3 seed: one store, link MAIN warehouse to it, scope cashier to that store+warehouse.
-- Run this in Supabase SQL Editor after 20250209500000_phase3_stores_and_scope.sql.
-- Safe to run: store insert only if missing; warehouse update and user_scope insert use real IDs from DB.

-- 1. Insert one store only if none named 'Main Store' exists
INSERT INTO stores (id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), 'Main Store', 'active', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = 'Main Store');

-- 2. Link the existing MAIN warehouse to that store
UPDATE warehouses
SET store_id = (SELECT id FROM stores WHERE name = 'Main Store' LIMIT 1)
WHERE code = 'MAIN';

-- 3. Scope cashier to that store and MAIN warehouse (only if not already present)
INSERT INTO user_scopes (user_email, store_id, warehouse_id, created_at)
SELECT
  'cashier@extremedeptkidz.com',
  s.id,
  w.id,
  now()
FROM stores s
CROSS JOIN warehouses w
WHERE s.name = 'Main Store' AND w.code = 'MAIN'
  AND NOT EXISTS (
    SELECT 1 FROM user_scopes us
    WHERE us.user_email = 'cashier@extremedeptkidz.com'
      AND us.store_id = s.id AND us.warehouse_id = w.id
  );
