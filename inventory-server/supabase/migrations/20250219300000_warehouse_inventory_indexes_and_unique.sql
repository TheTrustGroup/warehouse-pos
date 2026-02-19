-- Align with briefing: composite indexes for (warehouse_id, product_id).
-- Uniqueness on warehouse_inventory is already enforced by PK(warehouse_id, product_id) in 20250209000000.
-- If you need named constraint uq_wi_product_warehouse (e.g. after dedupe), add in Supabase:
--   alter table warehouse_inventory add constraint uq_wi_product_warehouse unique (product_id, warehouse_id);

-- 1. Composite index for warehouse_inventory (warehouse_id, product_id) – PK index may cover; explicit for consistency
create index if not exists idx_warehouse_inventory_warehouse_product
  on public.warehouse_inventory (warehouse_id, product_id);

-- 2. Composite index for warehouse_inventory_by_size for lookups/joins by (warehouse_id, product_id)
create index if not exists idx_warehouse_inventory_by_size_warehouse_product
  on public.warehouse_inventory_by_size (warehouse_id, product_id);
