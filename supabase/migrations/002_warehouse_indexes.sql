-- ============================================================
-- Warehouse list performance: indexes for v_products_inventory
--
-- Run after 001_complete_sql_fix.sql. These indexes speed up
-- GET /api/products (list by warehouse_id) and the view
-- v_products_inventory which joins warehouse_inventory and
-- warehouse_inventory_by_size.
-- ============================================================

-- Main list filter: warehouse_inventory.warehouse_id
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse_id
  ON warehouse_inventory (warehouse_id);

-- View subquery: warehouse_inventory_by_size by warehouse + product
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_by_size_warehouse_product
  ON warehouse_inventory_by_size (warehouse_id, product_id);
