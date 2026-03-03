-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f supabase/scripts/check_products_and_warehouse.sql
-- Note: This project uses warehouse_products (not "products"). warehouses holds locations.

-- 1) Check if default warehouse exists (Main Store fallback used by frontend)
SELECT * FROM warehouses
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2) Index names on tables used by GET /api/products
SELECT indexname
FROM pg_indexes
WHERE tablename IN (
  'warehouse_products',
  'warehouse_inventory',
  'warehouse_inventory_by_size'
)
ORDER BY tablename, indexname;

-- 3) Row counts for those tables
SELECT
  (SELECT COUNT(*) FROM warehouse_products)   AS warehouse_products,
  (SELECT COUNT(*) FROM warehouse_inventory)   AS warehouse_inventory,
  (SELECT COUNT(*) FROM warehouse_inventory_by_size) AS warehouse_inventory_by_size;

-- 4) Roles with non-default config (e.g. statement_timeout)
SELECT rolname, rolconfig
FROM pg_roles
WHERE rolconfig IS NOT NULL;

-- 5) Current statement_timeout
SHOW statement_timeout;

-- 6) EXPLAIN ANALYZE for products list (ORDER BY name, LIMIT 100). No warehouse_id on warehouse_products.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT "public"."warehouse_products"."id",
       "public"."warehouse_products"."sku",
       "public"."warehouse_products"."name",
       "public"."warehouse_products"."category"
FROM "public"."warehouse_products"
ORDER BY name
LIMIT 100 OFFSET 0;

-- ========== MAINTENANCE (run only when needed; these terminate backends) ==========

-- 7) Kill long-lived idle LISTEN "pgrst" connections (e.g. zombie PostgREST subscriptions)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query = 'LISTEN "pgrst"'
  AND query_start < now() - interval '1 hour';

-- 8) Kill idle in transaction (aborted) connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction (aborted)';
