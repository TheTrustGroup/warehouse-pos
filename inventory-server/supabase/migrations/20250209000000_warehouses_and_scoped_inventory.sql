-- First-class Warehouse entity and warehouse-scoped inventory.
-- Run after 20250204000000_create_warehouse_products.sql.
-- Backfills existing quantity into default warehouse, then drops global quantity.

-- 1. Warehouses table (first-class entity)
create table if not exists warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_warehouses_code on warehouses(code);

comment on table warehouses is 'First-class warehouse/location entity; inventory and POS are scoped to a warehouse.';

-- 2. Warehouse inventory: quantity per (warehouse, product)
create table if not exists warehouse_inventory (
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  product_id uuid not null references warehouse_products(id) on delete cascade,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id)
);

create index if not exists idx_warehouse_inventory_warehouse on warehouse_inventory(warehouse_id);
create index if not exists idx_warehouse_inventory_product on warehouse_inventory(product_id);

comment on table warehouse_inventory is 'Quantity per warehouse per product; single source of truth for stock by location.';

-- 3. Insert default warehouse (matches legacy "Main Store" label)
insert into warehouses (id, name, code, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Main Store',
  'MAIN',
  now(),
  now()
)
on conflict (code) do nothing;

-- 4. Backfill: copy current quantity from warehouse_products into warehouse_inventory for default warehouse (only if quantity column still exists; safe on re-run or if table was created without it)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'warehouse_products' and column_name = 'quantity'
  ) then
    insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    select
      (select id from warehouses where code = 'MAIN' limit 1),
      wp.id,
      wp.quantity,
      now()
    from warehouse_products wp
    where exists (select 1 from warehouses where code = 'MAIN')
    on conflict (warehouse_id, product_id) do update set
      quantity = excluded.quantity,
      updated_at = excluded.updated_at;
    alter table warehouse_products drop column quantity;
  end if;
end $$;
