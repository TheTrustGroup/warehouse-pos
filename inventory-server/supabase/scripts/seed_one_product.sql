-- Seed one product so GET /api/products returns at least one row (fixes "Server returned no products").
-- Run in Supabase SQL Editor against the same project your API uses (see DEBUG_WHY_EMPTY_PRODUCTS_PERSISTS.md).
-- Idempotent: safe to run multiple times (insert only if no products exist).

-- Default warehouse (migration 20250209000000). Must exist.
insert into warehouses (id, name, code, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Main Store',
  'MAIN',
  now(),
  now()
)
on conflict (code) do nothing;

-- One product only when warehouse_products is empty
insert into warehouse_products (
  id,
  sku,
  barcode,
  name,
  description,
  category,
  tags,
  cost_price,
  selling_price,
  reorder_level,
  location,
  supplier,
  images,
  created_by,
  created_at,
  updated_at,
  version,
  size_kind
)
select
  '00000000-0000-0000-0000-000000000101'::uuid,
  'SEED-001',
  '',
  'Sample Product',
  'First product so the API returns data.',
  'General',
  '[]'::jsonb,
  0,
  0,
  0,
  '{"warehouse":"","aisle":"","rack":"","bin":""}'::jsonb,
  '{"name":"","contact":"","email":""}'::jsonb,
  '[]'::jsonb,
  'seed',
  now(),
  now(),
  0,
  'na'
where not exists (select 1 from warehouse_products limit 1);

-- Stock for default warehouse (so quantity shows)
insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000101'::uuid,
  0,
  now()
where exists (select 1 from warehouse_products where id = '00000000-0000-0000-0000-000000000101'::uuid)
  and not exists (
    select 1 from warehouse_inventory
    where warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid
      and product_id = '00000000-0000-0000-0000-000000000101'::uuid
  );
