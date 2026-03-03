-- Speed up /api/products list by supporting:
-- - warehouse_inventory: eq(warehouse_id) + in(product_id)
-- - warehouse_inventory_by_size: eq(warehouse_id) + in(product_id) + optional join on size_codes(size_code)
-- - warehouse_products: ORDER BY name only (no warehouse_id column; warehouse filter is in app: only show products whose id appears in inventory results).
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

-- Speed up ORDER BY name on warehouse_products (used by GET /api/products list). No warehouse_id index — column does not exist; warehouse filter is applied in app after fetching inventory.
CREATE INDEX IF NOT EXISTS idx_warehouse_products_name ON public.warehouse_products (name);

-- If a products table exists (e.g. shared catalog), index warehouse_id for list/filter.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'warehouse_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_products_warehouse_id ON public.products (warehouse_id);
  END IF;
END $$;

