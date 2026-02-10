-- Phase 4: Offline sync — idempotency and sync rejection tracking.
-- Additive only. No data mutation. Server remains source of truth.

-- 1. Idempotency key on transactions (nullable for backward compatibility)
alter table transactions add column if not exists idempotency_key uuid unique;
create unique index if not exists idx_transactions_idempotency_key on transactions(idempotency_key) where idempotency_key is not null;
comment on column transactions.idempotency_key is 'Client-provided key for safe replay; duplicate key returns existing transaction (no double deduction).';

-- 2. Sync rejections: events we could not apply (e.g. insufficient stock, voided)
create table if not exists sync_rejections (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  pos_id text,
  store_id uuid references stores(id) on delete set null,
  warehouse_id uuid references warehouses(id) on delete set null,
  reason text not null,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_sync_rejections_idempotency_key on sync_rejections(idempotency_key);
create index if not exists idx_sync_rejections_voided on sync_rejections(voided_at) where voided_at is null;
create index if not exists idx_sync_rejections_created_at on sync_rejections(created_at desc);
comment on table sync_rejections is 'Rejected offline sync attempts (e.g. INSUFFICIENT_STOCK). Voided = admin chose not to fulfill.';

-- 3. process_sale: accept idempotency_key; check it first to return existing tx (no double deduction)
drop function if exists process_sale(uuid, jsonb, jsonb, uuid, text, uuid);

create or replace function process_sale(
  p_warehouse_id uuid,
  p_transaction jsonb,
  p_items jsonb,
  p_store_id uuid default null,
  p_pos_id text default null,
  p_operator_id uuid default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_tx_id uuid;
  r record;
begin
  -- Idempotency: same key replayed returns existing transaction (no second deduction)
  if p_idempotency_key is not null then
    select id into v_tx_id from transactions where idempotency_key = p_idempotency_key limit 1;
    if v_tx_id is not null then
      return v_tx_id;
    end if;
  end if;

  v_tx_id := (p_transaction->>'id')::uuid;
  if v_tx_id is null then
    raise exception 'Transaction id required';
  end if;

  -- Legacy idempotency: if already persisted by id, do not deduct again
  if exists (select 1 from transactions where id = v_tx_id) then
    return v_tx_id;
  end if;

  insert into transactions (
    id, transaction_number, type, warehouse_id, store_id, pos_id, operator_id,
    idempotency_key,
    subtotal, tax, discount, total,
    payment_method, payments, cashier, customer, status, sync_status, created_at, completed_at
  ) values (
    v_tx_id,
    coalesce(p_transaction->>'transactionNumber', ''),
    coalesce(p_transaction->>'type', 'sale'),
    p_warehouse_id,
    p_store_id,
    p_pos_id,
    p_operator_id,
    p_idempotency_key,
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

comment on function process_sale(uuid, jsonb, jsonb, uuid, text, uuid, uuid) is 'Phase 4: idempotency_key support; duplicate key returns existing tx, no double deduction.';
