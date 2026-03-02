-- Performance indexes for hot query paths.
-- Apply after core tables (warehouse_inventory, warehouse_inventory_by_size, sales, sale_lines, warehouse_products) exist.
-- Uses IF NOT EXISTS so migration is safe to run when indexes were created elsewhere.

-- warehouse_inventory: lookup by warehouse + product (record_sale, product list, manual fallback)
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse_product
  ON warehouse_inventory (warehouse_id, product_id);

-- warehouse_inventory_by_size: lookup by warehouse + product + size (record_sale, product list)
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_by_size_warehouse_product_size
  ON warehouse_inventory_by_size (warehouse_id, product_id, size_code);

-- sales: list by warehouse, newest first (GET /api/sales)
CREATE INDEX IF NOT EXISTS idx_sales_warehouse_created_desc
  ON sales (warehouse_id, created_at DESC);

-- sale_lines: join by sale_id (GET /api/sales with sale_lines)
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id
  ON sale_lines (sale_id);

-- warehouse_products: list ordered by name (getWarehouseProducts)
CREATE INDEX IF NOT EXISTS idx_warehouse_products_name
  ON warehouse_products (name);

-- warehouse_products: filter by category when used
CREATE INDEX IF NOT EXISTS idx_warehouse_products_category
  ON warehouse_products (category);
