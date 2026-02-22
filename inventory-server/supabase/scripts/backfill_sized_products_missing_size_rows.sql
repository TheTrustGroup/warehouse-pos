-- ============================================================
-- BACKFILL: Sized products with inventory but no size rows
-- Run in Supabase Dashboard → SQL Editor.
--
-- Use after running query 4 in inventory_diagnostic_fixed.sql and
-- seeing "NO SIZE ROWS — needs fix". This inserts one row per
-- (warehouse, product) into warehouse_inventory_by_size with
-- size_code = 'OS' (One Size) and quantity = warehouse_inventory.quantity,
-- so the product shows correctly in POS/Inventory.
--
-- Products with no warehouse_inventory row (e.g. "Sized Tee") are fixed by
-- step 1: insert 0-quantity inventory at every warehouse, then
-- step 2 adds the OS size row per warehouse.
-- ============================================================

-- Step 1: Give sized products with NO inventory row a 0-quantity row at every warehouse
INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
SELECT
  w.id AS warehouse_id,
  wp.id AS product_id,
  0,
  now()
FROM warehouse_products wp
CROSS JOIN warehouses w
WHERE wp.size_kind = 'sized'
  AND NOT EXISTS (SELECT 1 FROM warehouse_inventory wi WHERE wi.product_id = wp.id)
ON CONFLICT (warehouse_id, product_id)
DO UPDATE SET updated_at = EXCLUDED.updated_at;

-- Step 2: Backfill warehouse_inventory_by_size (includes products fixed in step 1)
INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
SELECT
  wi.warehouse_id,
  wi.product_id,
  'OS' AS size_code,
  wi.quantity,
  now() AS updated_at
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id AND wp.size_kind = 'sized'
WHERE NOT EXISTS (
  SELECT 1
  FROM warehouse_inventory_by_size wbs
  WHERE wbs.warehouse_id = wi.warehouse_id
    AND wbs.product_id = wi.product_id
)
ON CONFLICT (warehouse_id, product_id, size_code)
DO UPDATE SET
  quantity = EXCLUDED.quantity,
  updated_at = EXCLUDED.updated_at;
