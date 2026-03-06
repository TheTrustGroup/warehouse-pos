-- Run this in Supabase SQL Editor to enable cross-device sync for inventory updates.
-- Realtime will not broadcast changes for tables that are not in this publication.

-- Step A: Check which tables are already in the publication (run first to see current state)
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- Step B: Add tables required for inventory/size sync (run only if missing from Step A result)
-- If you get "already in publication" error for a line, skip that line.
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_inventory_by_size;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_products;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
