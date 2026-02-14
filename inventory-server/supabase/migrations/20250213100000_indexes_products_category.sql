-- Indexes for frequently queried product list filters (optimize slow save/load operations).
-- GET /admin/api/products and /api/products filter by category and order by updated_at; existing idx_warehouse_products_updated_at and idx_warehouse_products_sku already exist.

-- Category filter: list by category is common (e.g. Inventory filters).
create index if not exists idx_warehouse_products_category on warehouse_products(category);

-- Name prefix/lookup: helps ilike queries when search is by prefix (e.g. name ilike 'Foo%').
-- For full ilike '%foo%' consider pg_trgm GIN in future if search remains slow.
create index if not exists idx_warehouse_products_name_lower on warehouse_products(lower(name));

comment on index idx_warehouse_products_category is 'Speed up product list filter by category';
comment on index idx_warehouse_products_name_lower is 'Speed up product search by name (prefix/lower)';
