/* =============================================================================
   14 Database Diagnostic Queries (Pentagon Audit)
   Run in Supabase SQL Editor for BOTH projects: EDK and Hunnid.
   For queries 1, 4, 5, 6, 7, 8, 9, 10: ZERO rows = healthy. Non-zero = fix.
   For 2: add indexes on FK columns where missing. For 3, 11, 12, 13, 14: review.
   ============================================================================= */

/* Query 1: Tables without primary keys. Expected: 0 rows */
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT DISTINCT table_name
  FROM information_schema.table_constraints
  WHERE constraint_type = 'PRIMARY KEY'
  AND table_schema = 'public'
);

/* Query 2: Foreign keys without indexes. Add indexes for any rows returned */
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND NOT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename = tc.table_name
  AND indexdef LIKE '%' || kcu.column_name || '%'
);

/* Query 3: Columns that allow NULL but may need NOT NULL. Review. */
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND is_nullable = 'YES'
AND column_name IN (
  'warehouse_id', 'product_id', 'quantity',
  'price', 'cost_price', 'payment_method',
  'created_at', 'status', 'sale_id'
)
ORDER BY table_name, column_name;

/* Query 4: Orphaned inventory records. Expected: count = 0 */
SELECT COUNT(*) AS orphaned_inventory
FROM warehouse_inventory wi
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_products wp
  WHERE wp.id = wi.product_id
);

/* Query 5: Negative stock. Expected: 0 rows */
SELECT product_id, warehouse_id, quantity
FROM warehouse_inventory_by_size
WHERE quantity < 0;

/* Query 6: Stock drift (warehouse_inventory.quantity vs sum of sizes). Expected: 0 rows */
SELECT
  wi.warehouse_id,
  wi.product_id,
  wp.name,
  wi.quantity AS stored,
  COALESCE(SUM(wis.quantity), 0) AS actual,
  wi.quantity - COALESCE(SUM(wis.quantity), 0) AS drift
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id
LEFT JOIN warehouse_inventory_by_size wis
  ON wis.warehouse_id = wi.warehouse_id AND wis.product_id = wi.product_id
GROUP BY wi.warehouse_id, wi.product_id, wp.name, wi.quantity
HAVING wi.quantity != COALESCE(SUM(wis.quantity), 0)
ORDER BY ABS(wi.quantity - COALESCE(SUM(wis.quantity), 0)) DESC;

/* Query 7: Sales with no line items. Expected: 0 rows */
SELECT s.id, s.created_at, s.total
FROM sales s
WHERE NOT EXISTS (
  SELECT 1 FROM sale_lines sl
  WHERE sl.sale_id = s.id
);

/* Query 8: Sale lines with no parent sale. Expected: 0 rows */
SELECT sl.id, sl.sale_id, sl.product_id
FROM sale_lines sl
WHERE NOT EXISTS (
  SELECT 1 FROM sales s
  WHERE s.id = sl.sale_id
);

/* Query 9: Products with no inventory record. Review. */
SELECT wp.id, wp.name, wp.created_at
FROM warehouse_products wp
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_inventory wi
  WHERE wi.product_id = wp.id
);

/* Query 10: Duplicate SKUs (global). Expected: 0 rows */
SELECT sku, COUNT(*) AS count
FROM warehouse_products
GROUP BY sku
HAVING COUNT(*) > 1;

/* Query 11: All RLS policies. Review. */
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

/* Query 12: Tables with RLS enabled vs disabled. Review. */
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

/* Query 13: record_sale function signature */
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'record_sale'
AND pronamespace = 'public'::regnamespace;

/* Query 14: All check constraints. Review. */
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name;

/* Query 14b (optional): Check constraints for warehouse/POS tables only. Shorter list. */
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name IN (
  'sales', 'sale_lines', 'warehouse_products', 'warehouse_inventory',
  'warehouse_inventory_by_size', 'warehouses', 'size_codes'
)
ORDER BY tc.table_name, tc.constraint_name;

/* =============================================================================
   Placeholder warehouse ID (production 503/504) — run for EDK and Hunnid.
   ============================================================================= */

/* Does the placeholder warehouse exist? (Expected: 0 rows = server correctly rejects it) */
SELECT * FROM warehouses
WHERE id = '00000000-0000-0000-0000-000000000001';

/* What real warehouses exist? */
SELECT id, name, created_at
FROM warehouses
ORDER BY created_at;

/* What warehouse is the current user scoped to? (run while logged in; user_scopes uses user_email) */
SELECT us.user_email, us.warehouse_id, us.store_id, w.name AS warehouse_name
FROM user_scopes us
JOIN warehouses w ON w.id = us.warehouse_id
WHERE us.user_email = (auth.jwt() ->> 'email');

/* If above returns 0 rows (e.g. run as service role), list all user_scopes with warehouse names: */
-- SELECT us.user_email, us.warehouse_id, us.store_id, w.name AS warehouse_name
-- FROM user_scopes us
-- JOIN warehouses w ON w.id = us.warehouse_id
-- ORDER BY us.user_email, us.warehouse_id;

/* Step 4 verify: recent sales — warehouse_id must be real UUIDs (not placeholder) after fix */
SELECT id, warehouse_id, total, created_at
FROM sales
ORDER BY created_at DESC
LIMIT 5;
