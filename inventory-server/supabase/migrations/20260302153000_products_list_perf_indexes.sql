-- Speed up /api/products list by supporting:
-- - warehouse_inventory: eq(warehouse_id) + in(product_id)
-- - warehouse_inventory_by_size: eq(warehouse_id) + in(product_id) + optional join on size_codes(size_code)
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

