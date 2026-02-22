-- ============================================================
-- INVENTORY DIAGNOSTIC QUERIES (FIXED)
-- Run in Supabase Dashboard → SQL Editor.
--
-- Fix: warehouse_products (wp) has no warehouse_id column.
-- Use wi.warehouse_id / wbs.warehouse_id from inventory tables only.
-- ============================================================

-- -----------------------------------------------------------------------------
-- 3. SAMPLE PRODUCTS — do they have inventory rows?
-- -----------------------------------------------------------------------------
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  wi.warehouse_id,                  -- from inventory
  wi.quantity        AS inventory_total,
  COUNT(wbs.size_code) AS size_rows_in_db
FROM warehouse_products wp
LEFT JOIN warehouse_inventory         wi
       ON wi.product_id = wp.id
LEFT JOIN warehouse_inventory_by_size wbs
       ON wbs.product_id = wp.id
      AND (wi.warehouse_id IS NULL OR wbs.warehouse_id = wi.warehouse_id)
-- The AND above keeps counts aligned per warehouse when wi is present.
GROUP BY
  wp.id, wp.name, wp.size_kind, wi.warehouse_id, wi.quantity
ORDER BY wp.name
LIMIT 10;

-- -----------------------------------------------------------------------------
-- 4. SIZED PRODUCTS WITH NO SIZE ROWS
-- Fix: run backfill_sized_products_missing_size_rows.sql (for rows with
-- warehouse_id/total_qty set). Products with null warehouse_id need inventory
-- added in the app first, or set size_kind to 'na' if not actually sized.
-- -----------------------------------------------------------------------------
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  wi.warehouse_id,
  wi.quantity AS total_qty,
  'NO SIZE ROWS — needs fix' AS diagnosis
FROM warehouse_products wp
LEFT JOIN warehouse_inventory         wi
       ON wi.product_id = wp.id
LEFT JOIN warehouse_inventory_by_size wbs
       ON wbs.product_id = wp.id
      AND (wi.warehouse_id IS NULL OR wbs.warehouse_id = wi.warehouse_id)
WHERE wp.size_kind = 'sized'
  AND wbs.size_code IS NULL
ORDER BY wp.name;

-- -----------------------------------------------------------------------------
-- 5. PRODUCTS WITH INVENTORY = 0 BUT HAVE SIZE ROWS
-- -----------------------------------------------------------------------------
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  wi.warehouse_id,
  wi.quantity AS inventory_total,
  SUM(wbs.quantity) AS sum_of_sizes,
  'Inventory total out of sync with sizes' AS diagnosis
FROM warehouse_products wp
JOIN warehouse_inventory         wi
  ON wi.product_id = wp.id
JOIN warehouse_inventory_by_size wbs
  ON wbs.product_id  = wp.id
 AND wbs.warehouse_id = wi.warehouse_id
WHERE wp.size_kind = 'sized'
GROUP BY wp.id, wp.name, wp.size_kind, wi.warehouse_id, wi.quantity
HAVING wi.quantity != SUM(wbs.quantity);
