-- One-time (or maintenance) backfill: set public.warehouse_inventory.quantity to the sum of
-- public.warehouse_inventory_by_size.quantity for each (warehouse_id, product_id).
-- Run after fixing by_size data or to resync totals. Safe to run multiple times.

update public.warehouse_inventory wi
set
  quantity = coalesce(s.tot, 0),
  updated_at = now()
from (
  select warehouse_id, product_id, sum(quantity) as tot
  from public.warehouse_inventory_by_size
  group by warehouse_id, product_id
) s
where wi.warehouse_id = s.warehouse_id and wi.product_id = s.product_id
  and wi.quantity is distinct from coalesce(s.tot, 0);

-- Optional: insert missing (warehouse_id, product_id) rows that exist in by_size but not in warehouse_inventory
insert into public.warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
select warehouse_id, product_id, sum(quantity), now()
from public.warehouse_inventory_by_size
group by warehouse_id, product_id
on conflict (warehouse_id, product_id) do update set
  quantity = excluded.quantity,
  updated_at = excluded.updated_at;
