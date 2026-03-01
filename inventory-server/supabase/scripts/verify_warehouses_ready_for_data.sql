-- Verify both Main Store and Main Town are present and ready to receive data.
-- Run in Supabase SQL Editor. No writes; safe anytime.

-- 1. Warehouses that exist (expect MAIN + MAINTOWN; DC excluded from app)
SELECT id, name, code, created_at
FROM warehouses
WHERE code IN ('MAIN', 'MAINTOWN')
ORDER BY code;

-- 2. Row counts per warehouse (inventory + sales) — confirms both can hold data
SELECT
  w.code,
  w.name,
  (SELECT count(*) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS inventory_rows,
  (SELECT count(*) FROM warehouse_inventory_by_size wbs WHERE wbs.warehouse_id = w.id) AS by_size_rows,
  (SELECT count(*) FROM sales s WHERE s.warehouse_id = w.id) AS sales_rows
FROM warehouses w
WHERE w.code IN ('MAIN', 'MAINTOWN')
ORDER BY w.code;

-- 3. FK integrity: warehouse_id in child tables must reference warehouses(id)
-- (If this returns 0, integrity is OK.)
SELECT 'warehouse_inventory orphan' AS check_name, count(*) AS orphan_count
FROM warehouse_inventory wi
WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = wi.warehouse_id)
UNION ALL
SELECT 'sales orphan', count(*)
FROM sales s
WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.id = s.warehouse_id);
