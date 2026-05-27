# Run warehouse-scoped inventory migration in Supabase

Do this **once**, before deploying the updated backend.

## Where is the migration SQL?

- **Path in repo:** `inventory-server/supabase/migrations/20250209000000_warehouses_and_scoped_inventory.sql`
- **Copy below:** same SQL so you can run it from the Supabase dashboard without opening the file.

## Steps in Supabase

1. Open your Supabase project → **SQL Editor**.
2. New query → paste the full SQL below.
3. Run it (e.g. **Run** or Cmd/Ctrl+Enter).
4. Confirm: no errors; tables `warehouses` and `warehouse_inventory` exist; `warehouse_products` no longer has a `quantity` column.

## SQL to run (copy everything below)

```sql
-- First-class Warehouse entity and warehouse-scoped inventory.
-- Run after warehouse_products table exists. Backfills existing quantity into default warehouse, then drops global quantity.

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

-- 4. Backfill: copy current quantity from warehouse_products into warehouse_inventory for default warehouse
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

-- 5. Drop global quantity from warehouse_products (quantity now only in warehouse_inventory)
alter table warehouse_products drop column if exists quantity;
```

## Prerequisite

- Table **`warehouse_products`** must already exist (from the earlier migration `20250204000000_create_warehouse_products.sql`). If it doesn’t, create it first using that migration’s SQL.

## After running

- Deploy the updated **inventory-server** (backend) and **front-end** so they use the new schema.

---

## Optional: Atomic POS deduction (run after the migration above)

For atomic, concurrent-safe inventory deduction on sale, run the second migration:

- **Path in repo:** `inventory-server/supabase/migrations/20250209100000_atomic_deduct_inventory.sql`

It adds PostgreSQL functions `deduct_warehouse_inventory` and `process_sale_deductions` so that:

- Inventory cannot go negative (UPDATE ... WHERE quantity >= amount).
- Concurrent sales do not overwrite each other (single atomic decrement per line).
- POS uses POST /api/inventory/deduct before persisting the transaction.

Run that migration’s SQL in the Supabase SQL Editor after the main warehouse migration.

---

## Required: Transactions + stock_movements (run after atomic deduct)

For durable transaction persistence and inventory traceability (audit trail), run:

- **Path in repo:** `inventory-server/supabase/migrations/20250209200000_transactions_and_stock_movements.sql`

This creates:

- **transactions** and **transaction_items** tables (every sale persisted).
- **stock_movements** table (link each deduction to a transaction for audits).
- **process_sale** RPC: insert transaction + items + deduct inventory + write stock_movements in one atomic transaction (idempotent on transaction id for sync retries).

Run this migration’s SQL in the Supabase SQL Editor after the atomic deduct migration. The POS then uses **POST /api/transactions** only (no separate deduct call).

---

## Past inventory not showing after deploy?

Past inventory is **stored in the database**: the first migration backfilled existing `warehouse_products.quantity` into **warehouse_inventory** for the default warehouse (Main Store, id `00000000-0000-0000-0000-000000000001`). Nothing is deleted.

**Verify data in Supabase (SQL Editor):**

```sql
-- Count rows and total quantity per warehouse
SELECT w.code, w.name, COUNT(wi.product_id) AS product_count, COALESCE(SUM(wi.quantity), 0) AS total_quantity
FROM warehouses w
LEFT JOIN warehouse_inventory wi ON wi.warehouse_id = w.id
GROUP BY w.id, w.code, w.name;
```

If Main Store has `product_count` > 0 and `total_quantity` > 0, the data is there. The app was updated so that when no warehouse is selected it still requests products for the **default warehouse (Main Store)**. Redeploy the front-end so the inventory list shows again. If you use the inventory-server from this repo, ensure that backend is deployed too (it reads quantity from `warehouse_inventory`, not `warehouse_products.quantity`).
