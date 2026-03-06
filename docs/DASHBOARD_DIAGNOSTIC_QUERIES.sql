-- Run these in Supabase SQL Editor to diagnose dashboard API issues for a specific warehouse.
-- Replace the UUID below if needed (e.g. 00000000-0000-0000-0000-000000000001 for EDK).

-- 1. Does this warehouse exist?
SELECT
  id,
  name,
  created_at,
  admin_email
FROM warehouses
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 2. Does it have products? (Inventory is in warehouse_inventory / warehouse_inventory_by_size; warehouse_products is the global catalog.)
SELECT COUNT(DISTINCT product_id) AS product_count
FROM (
  SELECT warehouse_id, product_id FROM warehouse_inventory
  UNION
  SELECT warehouse_id, product_id FROM warehouse_inventory_by_size
) t
WHERE warehouse_id = '00000000-0000-0000-0000-000000000001';

-- 3. Does the dashboard view work for it?
SELECT *
FROM warehouse_dashboard_stats
WHERE warehouse_id = '00000000-0000-0000-0000-000000000001';

-- 4. Does the view exist at all?
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'warehouse_dashboard_stats';

-- 5. Are there sales for this warehouse?
SELECT COUNT(*) AS sale_count
FROM sales
WHERE warehouse_id = '00000000-0000-0000-0000-000000000001';

-- 6. Today-by-warehouse style query
SELECT
  DATE(created_at) AS sale_date,
  COUNT(*) AS sales,
  SUM(total) AS revenue
FROM sales
WHERE warehouse_id = '00000000-0000-0000-0000-000000000001'
  AND created_at >= CURRENT_DATE
GROUP BY DATE(created_at);
