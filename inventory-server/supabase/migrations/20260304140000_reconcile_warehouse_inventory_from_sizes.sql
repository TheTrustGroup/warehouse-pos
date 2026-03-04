-- One-time reconciliation: set warehouse_inventory.quantity = SUM(warehouse_inventory_by_size.quantity)
-- for every product/warehouse that has size rows. Fixes drift where inv.quantity was 0 but by_size had stock.
-- Run this after deploying the RPC fix (20260304130000). Safe to run multiple times.

UPDATE warehouse_inventory wi
SET quantity = sub.real_total
FROM (
  SELECT warehouse_id, product_id, COALESCE(SUM(quantity), 0)::int AS real_total
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
) sub
WHERE wi.warehouse_id = sub.warehouse_id
  AND wi.product_id = sub.product_id
  AND wi.quantity IS DISTINCT FROM sub.real_total;
