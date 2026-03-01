-- ============================================================
-- ADD_PERF_INDEXES.sql
-- Run in: Supabase Dashboard → SQL Editor
--
-- Indexes for performance at 500+ products, 10k+ sales.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- List products by warehouse (GET /api/products?warehouse_id=)
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse_product
  ON warehouse_inventory (warehouse_id, product_id);

-- Per-size stock (sized products list + sale deduction)
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_by_size_warehouse_product
  ON warehouse_inventory_by_size (warehouse_id, product_id);

-- Sale lines by sale (GET /api/sales with sale_lines join)
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id
  ON sale_lines (sale_id);

-- Sales history already has idx_sales_created_at from DELIVERY_MIGRATION
-- (warehouse_id, created_at DESC). No change needed.
