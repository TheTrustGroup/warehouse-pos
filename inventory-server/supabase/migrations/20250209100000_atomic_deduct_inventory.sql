-- Atomic inventory deduction for POS: prevents negative stock and concurrent overwrite.
-- Single row: UPDATE ... SET quantity = quantity - N WHERE quantity >= N.
-- Batch: function that deducts multiple lines in one transaction.

-- Single-line atomic deduct. Returns new quantity; raises if insufficient.
create or replace function deduct_warehouse_inventory(
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
  update warehouse_inventory
  set quantity = quantity - p_amount,
      updated_at = now()
  where warehouse_id = p_warehouse_id
    and product_id = p_product_id
    and quantity >= p_amount
  returning quantity into v_new_qty;
  if v_new_qty is null then
    raise exception 'INSUFFICIENT_STOCK: product % in warehouse % has insufficient quantity for deduct %', p_product_id, p_warehouse_id, p_amount;
  end if;
  return v_new_qty;
end;
$$;

-- Batch deduct: deducts each line in one transaction. Raises on first insufficient stock.
create or replace function process_sale_deductions(
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
    perform deduct_warehouse_inventory(p_warehouse_id, r.product_id, r.qty);
  end loop;
end;
$$;

comment on function deduct_warehouse_inventory is 'Atomic decrement; raises if quantity would go negative.';
comment on function process_sale_deductions is 'Batch atomic deductions in one transaction for POS sale.';
