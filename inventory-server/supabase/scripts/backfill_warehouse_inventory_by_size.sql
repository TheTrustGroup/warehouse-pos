-- One-time backfill: products that have warehouse_inventory quantity but no rows in warehouse_inventory_by_size
-- (e.g. warehouse_inventory_by_size table was added later). Inserts one row per (warehouse_id, product_id)
-- with size_code = 'One size' so the Size column shows "One size: N" and data is consistent.
-- Run in Supabase SQL Editor. Safe to run multiple times (no duplicate rows; insert only where missing).

insert into warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity)
select wi.warehouse_id, wi.product_id, 'One size', wi.quantity
from warehouse_inventory wi
where wi.quantity > 0
  and not exists (
    select 1 from warehouse_inventory_by_size wibs
    where wibs.warehouse_id = wi.warehouse_id and wibs.product_id = wi.product_id
  )
on conflict (warehouse_id, product_id, size_code) do update set quantity = excluded.quantity;
