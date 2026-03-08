-- Fix drift: products have quantity in warehouse_inventory but no rows in warehouse_inventory_by_size.
-- The UI and dashboard use: quantity = by_size sum when present, else inv.quantity.
-- If the UI doesn't show quantity for some products (e.g. Adidas SL 72) even though it's in the DB,
-- backfill by_size with one row per product using size code 'OS' (One Size) so both sources match.
--
-- Prerequisite: size code 'OS' must exist in size_codes (seed migration 20260305160000 adds it).
-- Safe to run multiple times (ON CONFLICT updates quantity to match inv).
--
-- After this, run scripts/SYNC_INV_FROM_BY_SIZE.sql if you have the opposite drift
-- (by_size exists but inv.quantity is out of sync). See docs/DATA_INTEGRITY_PRODUCT_DRIFT.md.

-- Backfill: one warehouse_inventory_by_size row per (warehouse_id, product_id) that has inv.quantity > 0 and zero by_size rows.
-- Size code: 'NA' for size_kind = 'na' (enforce_size_policy allows only NA for na products), 'OS' otherwise.
INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
SELECT
  wi.warehouse_id,
  wi.product_id,
  CASE WHEN wp.size_kind = 'na' THEN 'NA' ELSE 'OS' END,
  wi.quantity,
  now()
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id
WHERE wi.quantity > 0
  AND NOT EXISTS (
    SELECT 1
    FROM warehouse_inventory_by_size bs
    WHERE bs.warehouse_id = wi.warehouse_id
      AND bs.product_id = wi.product_id
  )
ON CONFLICT (warehouse_id, product_id, size_code) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  updated_at = EXCLUDED.updated_at;

-- Optional: show how many rows were backfilled (run separately if you want a count)
-- SELECT COUNT(*) FROM warehouse_inventory wi
-- WHERE wi.quantity > 0 AND NOT EXISTS (
--   SELECT 1 FROM warehouse_inventory_by_size bs
--   WHERE bs.warehouse_id = wi.warehouse_id AND bs.product_id = wi.product_id
-- );
