-- Atomic add (return) inventory for order returns. Mirrors deduct pattern.
-- Single-line and batch; used by POST /api/orders/return-stock.

-- Single-line add. Inserts or updates warehouse_inventory; quantity never goes negative.
create or replace function add_warehouse_inventory(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_amount int
)
returns int
language plpgsql
as $$
declare
  v_new_qty int;
begin
  if p_amount <= 0 then
    return (select quantity from warehouse_inventory where warehouse_id = p_warehouse_id and product_id = p_product_id);
  end if;
  insert into warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
  values (p_warehouse_id, p_product_id, p_amount, now())
  on conflict (warehouse_id, product_id) do update
  set quantity = warehouse_inventory.quantity + p_amount,
      updated_at = now()
  returning quantity into v_new_qty;
  return v_new_qty;
end;
$$;

-- Batch add for order returns.
create or replace function process_return_stock(
  p_warehouse_id uuid,
  p_items jsonb
)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in select (e->>'productId')::uuid as product_id, (e->>'quantity')::int as qty
           from jsonb_array_elements(p_items) e
  loop
    perform add_warehouse_inventory(p_warehouse_id, r.product_id, r.qty);
  end loop;
end;
$$;

comment on function add_warehouse_inventory is 'Atomic add (e.g. order return); upserts row.';
comment on function process_return_stock is 'Batch add inventory in one transaction for order returns.';
