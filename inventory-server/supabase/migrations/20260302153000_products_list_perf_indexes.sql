-- Speed up /api/products list by supporting:
-- - warehouse_inventory: eq(warehouse_id) + in(product_id)
-- - warehouse_inventory_by_size: eq(warehouse_id) + in(product_id) + optional join on size_codes(size_code)
-- - warehouse_products: warehouse_id filter (when column exists) and order by name
--
-- NOTE: Supabase migrations usually run in a transaction, so do NOT use CONCURRENTLY here.

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_warehouse_id_product_id
  ON public.warehouse_inventory (warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_wibs_warehouse_id_product_id
  ON public.warehouse_inventory_by_size (warehouse_id, product_id);

CREATE INDEX IF NOT EXISTS idx_wibs_warehouse_id_product_id_size_code
  ON public.warehouse_inventory_by_size (warehouse_id, product_id, size_code);

CREATE INDEX IF NOT EXISTS idx_size_codes_size_code
  ON public.size_codes (size_code);

-- Index for warehouse_products.warehouse_id when table is per-warehouse (speeds up list filtered by warehouse_id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouse_products' AND column_name = 'warehouse_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_warehouse_products_warehouse_id ON public.warehouse_products (warehouse_id);
  END IF;
END $$;

-- Speed up ORDER BY name on warehouse_products (used by GET /api/products list).
CREATE INDEX IF NOT EXISTS idx_warehouse_products_name ON public.warehouse_products (name);

