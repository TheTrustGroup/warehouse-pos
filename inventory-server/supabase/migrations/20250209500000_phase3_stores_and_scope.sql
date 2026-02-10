-- Phase 3: Store entity and scope-aware access. Additive only. No data mutation, no required fields.

-- 1. Stores table (new, optional)
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stores_status on stores(status);
comment on table stores is 'Store entity for multi-store clients. Optional; no retroactive assignment.';

-- 2. Warehouse → Store association (nullable, optional)
alter table warehouses add column if not exists store_id uuid references stores(id) on delete set null;
create index if not exists idx_warehouses_store_id on warehouses(store_id) where store_id is not null;
comment on column warehouses.store_id is 'Optional: warehouse belongs to one store. Null = legacy/unassigned.';

-- 3. User scope mapping (no role changes; defines where a role applies)
-- user_email = session email (no users table required)
create table if not exists user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  store_id uuid references stores(id) on delete cascade,
  warehouse_id uuid references warehouses(id) on delete cascade,
  pos_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_scopes_user_email on user_scopes(user_email);
create index if not exists idx_user_scopes_store on user_scopes(store_id) where store_id is not null;
create index if not exists idx_user_scopes_warehouse on user_scopes(warehouse_id) where warehouse_id is not null;
comment on table user_scopes is 'Where a user (by email) may operate. Absence = unrestricted (legacy). Multiple rows = union of allowed scope.';
