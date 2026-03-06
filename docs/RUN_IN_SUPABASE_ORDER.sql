-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR — IN THIS ORDER
-- Copy the whole file and run, or run each section one after the other.
-- If 12 errors (e.g. table warehouse_products missing or different schema), skip it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 1: Warehouses (identity: Main Store vs Main Town IDs and names)
-- -----------------------------------------------------------------------------
SELECT id, name, created_at
FROM warehouses
ORDER BY created_at;


-- -----------------------------------------------------------------------------
-- Section 2: Stores
-- -----------------------------------------------------------------------------
SELECT id, name, created_at
FROM stores
ORDER BY created_at;


-- -----------------------------------------------------------------------------
-- Section 3: User warehouse scopes (who can see which warehouse)
-- -----------------------------------------------------------------------------
SELECT
  us.user_email,
  us.warehouse_id,
  w.name AS warehouse_name
FROM user_scopes us
JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY us.user_email, w.name;


-- -----------------------------------------------------------------------------
-- Section 4: Inventory records per warehouse
-- -----------------------------------------------------------------------------
SELECT
  w.name AS warehouse_name,
  w.id AS warehouse_id,
  (SELECT COUNT(*) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS inventory_records
FROM warehouses w
ORDER BY w.name;


-- -----------------------------------------------------------------------------
-- Section 5: Inventory records per warehouse (JOIN)
-- -----------------------------------------------------------------------------
SELECT
  w.name AS warehouse_name,
  COUNT(wi.product_id) AS inventory_records
FROM warehouses w
LEFT JOIN warehouse_inventory wi ON wi.warehouse_id = w.id
GROUP BY w.id, w.name;


-- -----------------------------------------------------------------------------
-- Section 6: Size records per warehouse (warehouse_inventory_by_size)
-- -----------------------------------------------------------------------------
SELECT
  w.name AS warehouse_name,
  COUNT(wis.product_id) AS size_records,
  COALESCE(SUM(wis.quantity), 0) AS total_units
FROM warehouses w
LEFT JOIN warehouse_inventory_by_size wis ON wis.warehouse_id = w.id
GROUP BY w.id, w.name;


-- -----------------------------------------------------------------------------
-- Section 7: Sales per warehouse
-- -----------------------------------------------------------------------------
SELECT
  w.name AS warehouse_name,
  COUNT(s.id) AS sale_count,
  COALESCE(SUM(s.total), 0) AS total_revenue
FROM warehouses w
LEFT JOIN sales s ON s.warehouse_id = w.id
GROUP BY w.id, w.name;


-- -----------------------------------------------------------------------------
-- Section 8: Realtime publication (warehouse_inventory_by_size for size sync)
-- -----------------------------------------------------------------------------
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;


-- -----------------------------------------------------------------------------
-- Section 9: Unique constraint on warehouse_inventory_by_size (for UPSERT)
-- -----------------------------------------------------------------------------
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'warehouse_inventory_by_size'
AND constraint_type = 'UNIQUE';


-- -----------------------------------------------------------------------------
-- Section 10: Main Store inventory count (replace warehouse_id if different)
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS main_store_inventory_records
FROM warehouse_inventory wi
WHERE wi.warehouse_id = '00000000-0000-0000-0000-000000000001';


-- -----------------------------------------------------------------------------
-- Section 11: Size records by warehouse (raw counts)
-- -----------------------------------------------------------------------------
SELECT
  wis.warehouse_id,
  w.name,
  COUNT(*) AS size_records
FROM warehouse_inventory_by_size wis
LEFT JOIN warehouses w ON w.id = wis.warehouse_id
GROUP BY wis.warehouse_id, w.name;


-- -----------------------------------------------------------------------------
-- Section 12: Phantom products (no inventory record; optional)
-- -----------------------------------------------------------------------------
SELECT wp.id, wp.name
FROM warehouse_products wp
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_inventory wi
  WHERE wi.product_id = wp.id
)
LIMIT 20;
