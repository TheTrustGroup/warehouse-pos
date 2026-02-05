-- Warehouse products: single source of truth for warehouse UI and storefront.
-- Run this in Supabase SQL editor or via supabase db push if using Supabase CLI.

create table if not exists warehouse_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null default '',
  barcode text not null default '',
  name text not null default '',
  description text not null default '',
  category text not null default '',
  tags jsonb not null default '[]'::jsonb,
  quantity integer not null default 0,
  cost_price decimal(12,2) not null default 0,
  selling_price decimal(12,2) not null default 0,
  reorder_level integer not null default 0,
  location jsonb not null default '{"warehouse":"","aisle":"","rack":"","bin":""}'::jsonb,
  supplier jsonb not null default '{"name":"","contact":"","email":""}'::jsonb,
  images jsonb not null default '[]'::jsonb,
  expiry_date timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0
);

create index if not exists idx_warehouse_products_updated_at on warehouse_products(updated_at desc);
create index if not exists idx_warehouse_products_sku on warehouse_products(sku);

comment on table warehouse_products is 'Single source of truth for warehouse inventory; used by /api/products and /admin/api/products.';
