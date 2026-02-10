-- Durable transaction persistence + inventory traceability (stock_movements).
-- One RPC process_sale: insert transaction + items + deduct + stock_movements in one transaction.

-- 1. Transactions table
create table if not exists transactions (
  id uuid primary key,
  transaction_number text not null,
  type text not null default 'sale',
  warehouse_id uuid references warehouses(id),
  subtotal decimal(12,2) not null default 0,
  tax decimal(12,2) not null default 0,
  discount decimal(12,2) not null default 0,
  total decimal(12,2) not null default 0,
  payment_method text not null default 'cash',
  payments jsonb not null default '[]',
  cashier text not null default '',
  customer jsonb,
  status text not null default 'completed',
  sync_status text not null default 'synced',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_transactions_warehouse on transactions(warehouse_id);
create index if not exists idx_transactions_created_at on transactions(created_at desc);
create index if not exists idx_transactions_number on transactions(transaction_number);

-- 2. Transaction line items
create table if not exists transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  product_id uuid not null references warehouse_products(id),
  product_name text not null default '',
  sku text not null default '',
  quantity int not null default 0,
  unit_price decimal(12,2) not null default 0,
  subtotal decimal(12,2) not null default 0
);

create index if not exists idx_transaction_items_tx on transaction_items(transaction_id);

-- 3. Stock movements (audit trail: link sale → inventory change)
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete set null,
  warehouse_id uuid not null references warehouses(id),
  product_id uuid not null references warehouse_products(id),
  quantity_delta int not null,
  reference_type text not null default 'sale',
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_transaction on stock_movements(transaction_id);
create index if not exists idx_stock_movements_warehouse_product on stock_movements(warehouse_id, product_id);
create index if not exists idx_stock_movements_created_at on stock_movements(created_at desc);

comment on table stock_movements is 'Audit trail: every inventory change traceable to transaction (or adjustment).';

-- 4. Single RPC: persist transaction + items + deduct inventory + write stock_movements (all or nothing)
create or replace function process_sale(
  p_warehouse_id uuid,
  p_transaction jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_tx_id uuid;
  r record;
begin
  v_tx_id := (p_transaction->>'id')::uuid;
  if v_tx_id is null then
    raise exception 'Transaction id required';
  end if;

  -- Idempotent: if already persisted (e.g. sync retry), do not deduct again
  if exists (select 1 from transactions where id = v_tx_id) then
    return v_tx_id;
  end if;

  insert into transactions (
    id, transaction_number, type, warehouse_id, subtotal, tax, discount, total,
    payment_method, payments, cashier, customer, status, sync_status, created_at, completed_at
  ) values (
    v_tx_id,
    coalesce(p_transaction->>'transactionNumber', ''),
    coalesce(p_transaction->>'type', 'sale'),
    p_warehouse_id,
    (p_transaction->>'subtotal')::decimal,
    (p_transaction->>'tax')::decimal,
    (p_transaction->>'discount')::decimal,
    (p_transaction->>'total')::decimal,
    coalesce(p_transaction->>'paymentMethod', 'cash'),
    coalesce(p_transaction->'payments', '[]'),
    coalesce(p_transaction->>'cashier', ''),
    p_transaction->'customer',
    coalesce(p_transaction->>'status', 'completed'),
    coalesce(p_transaction->>'syncStatus', 'synced'),
    coalesce((p_transaction->>'createdAt')::timestamptz, now()),
    (p_transaction->>'completedAt')::timestamptz
  );

  insert into transaction_items (transaction_id, product_id, product_name, sku, quantity, unit_price, subtotal)
  select
    v_tx_id,
    (e->>'productId')::uuid,
    coalesce(e->>'productName', ''),
    coalesce(e->>'sku', ''),
    (e->>'quantity')::int,
    (e->>'unitPrice')::decimal,
    (e->>'subtotal')::decimal
  from jsonb_array_elements(p_items) e;

  perform process_sale_deductions(p_warehouse_id, p_items);

  for r in select (e->>'productId')::uuid as product_id, (e->>'quantity')::int as qty
           from jsonb_array_elements(p_items) e
  loop
    insert into stock_movements (transaction_id, warehouse_id, product_id, quantity_delta, reference_type)
    values (v_tx_id, p_warehouse_id, r.product_id, -r.qty, 'sale');
  end loop;

  return v_tx_id;
end;
$$;

comment on function process_sale is 'Persist sale transaction + items + deduct inventory + stock_movements in one atomic transaction.';
