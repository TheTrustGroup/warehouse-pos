-- Diagnose: why does Main Town show the same stats as Main Store?
-- Run in Supabase SQL Editor. Replace <MAIN_TOWN_UUID> with your Main Town warehouse id (e.g. 312ee60a-9bcb-4a5f-b6ae-59393f716867).

-- 1. Row counts per warehouse (if Main Town has same count as Main Store, data was likely copied)
SELECT
  w.id,
  w.name,
  w.code,
  (SELECT COUNT(*) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS inventory_rows,
  (SELECT COALESCE(SUM(wi.quantity), 0) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS total_quantity
FROM warehouses w
ORDER BY w.name;

-- 2. If Main Town should have its own (possibly empty) inventory and currently shows copied data,
--    run the following ONCE after replacing <MAIN_TOWN_UUID> with the real Main Town warehouse id:
-- DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = '<MAIN_TOWN_UUID>';
-- DELETE FROM warehouse_inventory WHERE warehouse_id = '<MAIN_TOWN_UUID>';
-- Then Main Town will show 0 products until you add real Main Town inventory.
