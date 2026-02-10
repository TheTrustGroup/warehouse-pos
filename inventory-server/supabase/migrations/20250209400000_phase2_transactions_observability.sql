-- Phase 2: Sales observability — additive only. No rewrites, no backfill, no NOT NULL.
-- Existing rows remain untouched. New columns are nullable.

-- 1. Add nullable columns to transactions (no default, no backfill)
alter table transactions add column if not exists store_id uuid;
alter table transactions add column if not exists pos_id text;
alter table transactions add column if not exists operator_id uuid;

comment on column transactions.store_id is 'Optional store context from session (Phase 2).';
comment on column transactions.pos_id is 'Optional device/POS id from session (Phase 2).';
comment on column transactions.operator_id is 'Optional user id of operator (Phase 2). Populated when session provides it.';

-- 2. Indexes for filtered list (admin GET /api/transactions)
create index if not exists idx_transactions_store_id on transactions(store_id) where store_id is not null;
create index if not exists idx_transactions_pos_id on transactions(pos_id) where pos_id is not null;
create index if not exists idx_transactions_operator_id on transactions(operator_id) where operator_id is not null;

-- 3. Replace process_sale: drop the original 3-arg version so the name is unique, then create 6-arg version
drop function if exists process_sale(uuid, jsonb, jsonb);

create or replace function process_sale(
  p_warehouse_id uuid,
  p_transaction jsonb,
  p_items jsonb,
  p_store_id uuid default null,
  p_pos_id text default null,
  p_operator_id uuid default null
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
    id, transaction_number, type, warehouse_id, store_id, pos_id, operator_id,
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

comment on function process_sale(uuid, jsonb, jsonb, uuid, text, uuid) is 'Persist sale + items + deduct + stock_movements. Phase 2: optional store_id, pos_id, operator_id from session.';
