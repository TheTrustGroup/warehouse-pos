-- =============================================================================
-- SUPABASE ROOT-CAUSE INVESTIGATION: WHY SIZES NEVER SHOW IN PRODUCT LIST
-- Run this in Supabase Dashboard → SQL Editor. No UI patching; DB-level truth.
--
-- This codebase does NOT have a single "sizes" column. Sizes come from:
--   • warehouse_products.size_kind (na | one_size | sized)
--   • warehouse_inventory_by_size (rows per warehouse_id, product_id, size_code)
-- So we verify those two sources and the structural causes below.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PHASE 1 — VERIFY TRUE DATABASE STATE
-- Are size_kind and warehouse_inventory_by_size populated for recent products?
-- -----------------------------------------------------------------------------
SELECT '=== PHASE 1: Recent products and size state ===' AS step;
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  wp.updated_at,
  (SELECT jsonb_agg(jsonb_build_object('size_code', wibs.size_code, 'quantity', wibs.quantity))
   FROM warehouse_inventory_by_size wibs
   WHERE wibs.product_id = wp.id
     AND wibs.warehouse_id = (SELECT id FROM warehouses LIMIT 1)) AS by_size
FROM warehouse_products wp
ORDER BY wp.updated_at DESC
LIMIT 10;

-- If size_kind is NULL or always 'na' → insertion/update bug.
-- If size_kind = 'sized' but by_size is NULL/empty → by_size not written or wrong warehouse.

-- -----------------------------------------------------------------------------
-- PHASE 2 — CHECK IF USING A VIEW (list might read from a view that omits sizes)
-- -----------------------------------------------------------------------------
SELECT '=== PHASE 2: Views containing "product" ===' AS step;
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND (viewname ILIKE '%product%' OR viewname ILIKE '%inventory%');

-- If you use .from('products_view') or similar, ensure the view includes size_kind
-- and that the app doesn't rely on the view for by_size (by_size is joined in app code).

-- -----------------------------------------------------------------------------
-- PHASE 3 — CHECK FOR MULTIPLE PRODUCT TABLES (insert into one, select from another)
-- -----------------------------------------------------------------------------
SELECT '=== PHASE 3: All product-related tables ===' AS step;
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename ILIKE '%product%'
ORDER BY tablename;

-- Expected: warehouse_products (and maybe junction/audit tables). 
-- If you see both "products" and "warehouse_products", ensure insert and list use the SAME table.

-- -----------------------------------------------------------------------------
-- PHASE 4 — CHECK TRIGGERS ON warehouse_products (could overwrite size_kind or by_size)
-- -----------------------------------------------------------------------------
SELECT '=== PHASE 4: Triggers on warehouse_products ===' AS step;
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('warehouse_products', 'warehouse_inventory_by_size')
ORDER BY event_object_table, trigger_name;

-- If any triggers exist, inspect their function body for SET size_kind or writes to warehouse_inventory_by_size.

-- -----------------------------------------------------------------------------
-- PHASE 5 — (Code review) Partial update wiping sizes
-- Already verified in code: update uses bodyToRow({ ...existing, ...body }) and
-- RPC update_warehouse_product_atomic uses COALESCE(..., size_kind) so existing
-- size_kind is preserved when not sent. Legacy path sends full row. No .update({ sizes: null }).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- PHASE 6 — FORCE TEST INSERT (proves schema and RLS allow size_kind + by_size)
-- Uses default warehouse; adjust warehouse id if your default differs.
-- -----------------------------------------------------------------------------
SELECT '=== PHASE 6: Test insert (run manually if you want to prove write path) ===' AS step;
-- Uncomment and run once to test; then delete the test row.
/*
INSERT INTO warehouse_products (
  id, sku, barcode, name, description, category, tags,
  cost_price, selling_price, reorder_level, location, supplier, images, expiry_date,
  created_by, created_at, updated_at, version, size_kind
)
VALUES (
  gen_random_uuid(),
  'TEST-SIZE-' || substr(gen_random_uuid()::text, 1, 8),
  '',
  'Test Product Sizes',
  '',
  '',
  '[]'::jsonb,
  0, 0, 0,
  '{"warehouse":"","aisle":"","rack":"","bin":""}'::jsonb,
  '{"name":"","contact":"","email":""}'::jsonb,
  '[]'::jsonb,
  NULL,
  '',
  now(), now(), 0,
  'sized'
);

INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
SELECT
  (SELECT id FROM warehouses LIMIT 1),
  wp.id,
  s.code,
  s.qty,
  now()
FROM warehouse_products wp
CROSS JOIN (VALUES ('S', 1), ('M', 2), ('L', 3)) AS s(code, qty)
WHERE wp.name = 'Test Product Sizes';

-- Then run:
-- SELECT wp.id, wp.name, wp.size_kind, (SELECT jsonb_agg(jsonb_build_object('size_code', wibs.size_code, 'quantity', wibs.quantity)) FROM warehouse_inventory_by_size wibs WHERE wibs.product_id = wp.id) AS by_size FROM warehouse_products wp WHERE wp.name = 'Test Product Sizes';
-- If this returns size_kind = 'sized' and by_size with 3 rows → DB and schema are fine; bug is in app (warehouse_id mismatch or RPC not deployed).
*/
-- To actually run the test: open and run phase6_test_insert_sizes.sql in this folder.

-- -----------------------------------------------------------------------------
-- QUICK REFERENCE: Size flow in this app
-- -----------------------------------------------------------------------------
-- • List: getWarehouseProducts(warehouseId) → .from('warehouse_products').select(pos ? '...size_kind' : '*')
--   → sizedIds = rows where size_kind = 'sized'
--   → getQuantitiesBySizeForProducts(warehouseId, sizedIds) → warehouse_inventory_by_size
--   → merged into quantityBySize in API response.
-- • Create: create_warehouse_product_atomic(p_warehouse_id, p_row, p_quantity_by_size) or legacy insert + setQuantitiesBySize(warehouseId, ...)
-- • Update: update_warehouse_product_atomic(..., p_quantity_by_size) or legacy update row + setQuantitiesBySize(warehouseId, ...)
--
-- Most likely causes if sizes never show:
-- 1. List and create/update use different warehouse_id (list reads by_size for warehouse A, create wrote for default warehouse B).
-- 2. RPC create_warehouse_product_atomic / update_warehouse_product_atomic not deployed (check Phase 1 of check_size_migrations_applied.sql).
-- 3. size_kind not set to 'sized' when product has multiple sizes (bodyToRow sets it when hasSized; RPC sets it when p_quantity_by_size length > 0).
-- =============================================================================
