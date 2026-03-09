-- Recreate the unique SKU index after it was dropped.
-- Run this in Supabase SQL Editor if you ran: DROP INDEX IF EXISTS idx_warehouse_products_sku_unique
-- If you get "duplicate key" error, run the full migration 20260309100000_sku_unique_and_size_codes.sql instead (it fixes duplicates first).

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_products_sku_unique
  ON warehouse_products(sku)
  WHERE sku IS NOT NULL AND trim(sku) <> '';

COMMENT ON INDEX idx_warehouse_products_sku_unique IS 'Prevent duplicate products: one product per non-empty SKU.';
