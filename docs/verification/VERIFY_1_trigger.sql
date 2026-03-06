-- VERIFY 1 — Trigger (run this alone). Should return 1 row.
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'warehouse_inventory_by_size'
ORDER BY trigger_name;
