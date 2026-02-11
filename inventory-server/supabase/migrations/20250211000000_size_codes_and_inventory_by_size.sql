-- ADDITIVE ONLY: size codes and per-size inventory. No changes to existing tables/columns except adding new columns.
-- Existing warehouse_inventory and warehouse_products rows are untouched.
-- Non-sized products use size_code NA or OS (one size).

-- 1. Reference table: size codes (system identifier + human label + sort order)
create table if not exists size_codes (
  size_code text primary key,
  size_label text not null,
  size_order integer not null default 0
);

create index if not exists idx_size_codes_order on size_codes(size_order);

comment on table size_codes is 'Reference: normalized size_code (e.g. US9, M, W32), human-readable size_label, optional sort order.';

-- 2. Per-size inventory (additive). Total quantity remains in warehouse_inventory for backward compatibility and POS.
create table if not exists warehouse_inventory_by_size (
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  product_id uuid not null references warehouse_products(id) on delete cascade,
  size_code text not null references size_codes(size_code) on delete restrict,
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, product_id, size_code)
);

create index if not exists idx_warehouse_inventory_by_size_product on warehouse_inventory_by_size(product_id);
create index if not exists idx_warehouse_inventory_by_size_warehouse on warehouse_inventory_by_size(warehouse_id);

comment on table warehouse_inventory_by_size is 'Quantity per warehouse per product per size. Used when product has size_kind = sized. Total still in warehouse_inventory for POS.';

-- 3. Add size_kind to warehouse_products (additive column only)
alter table warehouse_products
  add column if not exists size_kind text not null default 'na';

comment on column warehouse_products.size_kind is 'na = no sizes (use NA). one_size = single size (use OS). sized = multiple sizes (use warehouse_inventory_by_size).';

-- 4. Seed default size codes: NA, OS; adult + kids/infant (kidswear-friendly)
insert into size_codes (size_code, size_label, size_order) values
  ('NA', 'N/A', -100),
  ('OS', 'One Size', -99)
on conflict (size_code) do nothing;

-- Adult footwear (US)
insert into size_codes (size_code, size_label, size_order) values
  ('US6', 'US 6', 10),
  ('US7', 'US 7', 11),
  ('US8', 'US 8', 12),
  ('US9', 'US 9', 13),
  ('US10', 'US 10', 14),
  ('US11', 'US 11', 15),
  ('US12', 'US 12', 16),
  ('US13', 'US 13', 17)
on conflict (size_code) do nothing;

-- Adult apparel (letter)
insert into size_codes (size_code, size_label, size_order) values
  ('XS', 'XS', 20),
  ('S', 'S', 21),
  ('M', 'M', 22),
  ('L', 'L', 23),
  ('XL', 'XL', 24),
  ('XXL', 'XXL', 25)
on conflict (size_code) do nothing;

-- Adult waist
insert into size_codes (size_code, size_label, size_order) values
  ('W28', 'W28', 30),
  ('W30', 'W30', 31),
  ('W32', 'W32', 32),
  ('W34', 'W34', 33),
  ('W36', 'W36', 34)
on conflict (size_code) do nothing;

-- Infant (months)
insert into size_codes (size_code, size_label, size_order) values
  ('0-3M', '0-3 M', 40),
  ('3-6M', '3-6 M', 41),
  ('6-9M', '6-9 M', 42),
  ('9-12M', '9-12 M', 43),
  ('12-18M', '12-18 M', 44),
  ('18-24M', '18-24 M', 45)
on conflict (size_code) do nothing;

-- Toddler (T sizes)
insert into size_codes (size_code, size_label, size_order) values
  ('2T', '2T', 46),
  ('3T', '3T', 47),
  ('4T', '4T', 48),
  ('5T', '5T', 49)
on conflict (size_code) do nothing;

-- Kids footwear (US kids 1-13)
insert into size_codes (size_code, size_label, size_order) values
  ('US1K', 'US 1 (Kids)', 50),
  ('US2K', 'US 2 (Kids)', 51),
  ('US3K', 'US 3 (Kids)', 52),
  ('US4K', 'US 4 (Kids)', 53),
  ('US5K', 'US 5 (Kids)', 54),
  ('US6K', 'US 6 (Kids)', 55),
  ('US7K', 'US 7 (Kids)', 56),
  ('US8K', 'US 8 (Kids)', 57),
  ('US9K', 'US 9 (Kids)', 58),
  ('US10K', 'US 10 (Kids)', 59),
  ('US11K', 'US 11 (Kids)', 60),
  ('US12K', 'US 12 (Kids)', 61),
  ('US13K', 'US 13 (Kids)', 62)
on conflict (size_code) do nothing;

-- Youth clothing (numeric)
insert into size_codes (size_code, size_label, size_order) values
  ('6Y', '6Y', 63),
  ('8Y', '8Y', 64),
  ('10Y', '10Y', 65),
  ('12Y', '12Y', 66),
  ('14Y', '14Y', 67)
on conflict (size_code) do nothing;
