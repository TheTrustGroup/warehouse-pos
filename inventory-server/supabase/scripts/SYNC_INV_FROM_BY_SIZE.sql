-- Fix opposite drift: warehouse_inventory.quantity ≠ sum(warehouse_inventory_by_size) for same (warehouse_id, product_id).
-- Use when by_size is correct but inv is stale (e.g. after manual by_size edits or before the sync trigger existed).
-- Safe to run multiple times. Run FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql first if you have inv-only rows with no by_size.

UPDATE warehouse_inventory wi
SET
  quantity = bs.sum_qty,
  updated_at = now()
FROM (
  SELECT warehouse_id, product_id, COALESCE(SUM(quantity), 0)::int AS sum_qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
) bs
WHERE wi.warehouse_id = bs.warehouse_id
  AND wi.product_id = bs.product_id
  AND wi.quantity IS DISTINCT FROM bs.sum_qty;

-- Optional: insert warehouse_inventory rows where by_size has rows but inv has no row (e.g. orphan by_size from migration).
INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
SELECT
  bs.warehouse_id,
  bs.product_id,
  bs.sum_qty,
  now()
FROM (
  SELECT warehouse_id, product_id, COALESCE(SUM(quantity), 0)::int AS sum_qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
) bs
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_inventory wi
  WHERE wi.warehouse_id = bs.warehouse_id AND wi.product_id = bs.product_id
)
ON CONFLICT (warehouse_id, product_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  updated_at = EXCLUDED.updated_at;
