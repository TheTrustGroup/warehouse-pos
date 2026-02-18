-- Run this in Supabase Dashboard → SQL Editor to verify size-related migrations are applied.
-- Migrations checked: 20250211000000, 20250211010000, 20250211020000 (and 20250213000000 RPCs).

-- 1. Table size_codes (from 20250211000000_size_codes_and_inventory_by_size.sql)
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'size_codes'
) as "size_codes table exists";

-- 2. Table warehouse_inventory_by_size (from same migration)
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'warehouse_inventory_by_size'
) as "warehouse_inventory_by_size table exists";

-- 3. Column size_kind on warehouse_products (from same migration)
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'warehouse_products' and column_name = 'size_kind'
) as "warehouse_products.size_kind column exists";

-- 4. RPC create_warehouse_product_atomic (from 20250213000000_atomic_product_inventory_rpc.sql)
select exists (
  select 1 from information_schema.routines
  where routine_schema = 'public' and routine_name = 'create_warehouse_product_atomic'
) as "create_warehouse_product_atomic RPC exists";

-- 5. Summary: all four must be true for sizes to work
select
  (select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'size_codes')) as size_codes_ok,
  (select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'warehouse_inventory_by_size')) as by_size_ok,
  (select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'warehouse_products' and column_name = 'size_kind')) as size_kind_ok,
  (select exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_warehouse_product_atomic')) as rpc_ok;

-- 6. Optional: run these only if the above checks are true (otherwise they will error)
-- select count(*) as size_codes_count from size_codes;
-- select count(*) as warehouse_inventory_by_size_count from warehouse_inventory_by_size;

-- 7. Verify sizes in DB: product list shows sizes from warehouse_inventory_by_size + warehouse_products.size_kind (no single "sizes" column).
-- If this returns rows with non-null size_kind and by_size rows, SELECT/list will return quantityBySize; if empty, check insert/update sends quantityBySize and size_kind.
-- select wp.id, wp.name, wp.size_kind, (select jsonb_agg(jsonb_build_object('size_code', wibs.size_code, 'quantity', wibs.quantity)) from warehouse_inventory_by_size wibs where wibs.product_id = wp.id and wibs.warehouse_id = (select id from warehouses limit 1)) as by_size from warehouse_products wp limit 5;
