-- Enable Supabase Realtime (postgres_changes) for tables used by useInventoryRealtime.
-- Add only if not already in publication (idempotent). Run in Supabase SQL or via migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'warehouse_inventory_by_size') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_inventory_by_size;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'sales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sales;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'warehouse_products') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_products;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'warehouse_inventory') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_inventory;
  END IF;
END
$$;

COMMENT ON PUBLICATION supabase_realtime IS 'Supabase-managed; this migration ensures warehouse_inventory_by_size, sales, warehouse_products, warehouse_inventory are in the publication for Realtime postgres_changes.';
