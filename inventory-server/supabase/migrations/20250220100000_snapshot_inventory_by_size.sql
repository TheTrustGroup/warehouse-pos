-- Snapshot per-size inventory for multiple products in one warehouse via JSON payload.
-- CTE-only implementation (no temp tables) so it can run where temp table creation is restricted.
-- Idempotent: same payload produces no change. Safe: deletes only affect provided products in the given warehouse.
--
-- Recommended indices (already present): warehouse_inventory_by_size PK and idx_warehouse_inventory_by_size_warehouse_product;
-- warehouse_inventory PK; warehouses(code) unique. RLS: use SECURITY DEFINER and grant execute to intended roles.

create or replace function public.snapshot_inventory_by_size(
  warehouse_ref text,
  payload jsonb
)
returns table (
  warehouse_id uuid,
  products_affected bigint,
  rows_upserted bigint,
  rows_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_products_affected bigint;
  v_rows_upserted bigint;
  v_rows_deleted bigint;
begin
  -- 1. Resolve warehouse by UUID or by code
  if trim(warehouse_ref) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select w.id into v_warehouse_id from warehouses w where w.id = warehouse_ref::uuid limit 1;
  else
    select w.id into v_warehouse_id from warehouses w where w.code = trim(warehouse_ref) limit 1;
  end if;
  if v_warehouse_id is null then
    raise exception 'Warehouse not found: %', warehouse_ref;
  end if;

  -- 2. Validate payload is a non-null array (no temp table; inline checks)
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Payload must be a non-null JSON array';
  end if;

  -- 3. Delete sizes for affected products that are not in the new snapshot, then upsert and rollup (CTE-only)
  with
  payload_elems as (
    select
      (elem->>'product_id')::uuid as product_id,
      nullif(trim(elem->>'size_code'), '') as size_code,
      greatest(0, coalesce((elem->>'quantity')::int, 0)) as quantity
    from jsonb_array_elements(payload) as elem
    where (elem->>'product_id') is not null
      and (elem->>'product_id')::uuid is not null
      and nullif(trim(elem->>'size_code'), '') is not null
  ),
  deduped as (
    select product_id, size_code, sum(quantity) as quantity
    from payload_elems
    group by product_id, size_code
  ),
  to_delete as (
    delete from warehouse_inventory_by_size w
    where w.warehouse_id = v_warehouse_id
      and w.product_id in (select product_id from deduped)
      and not exists (
        select 1 from deduped d
        where d.product_id = w.product_id and d.size_code = w.size_code
      )
    returning 1
  ),
  upserted as (
    insert into warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
    select v_warehouse_id, d.product_id, d.size_code, d.quantity, now()
    from deduped d
    on conflict (warehouse_id, product_id, size_code)
    do update set quantity = excluded.quantity, updated_at = excluded.updated_at
    returning 1
  ),
  rollup as (
    insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    select w.warehouse_id, w.product_id, sum(w.quantity), now()
    from warehouse_inventory_by_size w
    where w.warehouse_id = v_warehouse_id
      and w.product_id in (select product_id from deduped)
    group by w.warehouse_id, w.product_id
    on conflict (warehouse_id, product_id)
    do update set quantity = excluded.quantity, updated_at = excluded.updated_at
  )
  select
    (select count(distinct product_id) from deduped),
    (select count(*) from upserted),
    (select count(*) from to_delete)
  into v_products_affected, v_rows_upserted, v_rows_deleted;

  -- 4. Return summary
  warehouse_id := v_warehouse_id;
  products_affected := v_products_affected;
  rows_upserted := v_rows_upserted;
  rows_deleted := v_rows_deleted;
  return next;
  return;
end;
$$;

comment on function public.snapshot_inventory_by_size(text, jsonb) is
  'Snapshot per-size inventory for multiple products in one warehouse. Payload: array of { product_id (uuid), size_code (text), quantity (int >= 0) }. Dedupes by (product_id, size_code). Deletes sizes not in snapshot; upserts provided sizes; recomputes warehouse_inventory rollups. Idempotent and scope-limited.';

-- Optional: allow authenticated role to execute (uncomment if using Supabase auth)
-- grant execute on function public.snapshot_inventory_by_size(text, jsonb) to authenticated;
-- grant execute on function public.snapshot_inventory_by_size(text, jsonb) to service_role;
