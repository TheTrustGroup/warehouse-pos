-- Allow API product-list queries to run up to 30s (avoids "canceling statement due to statement timeout").
-- Supabase default is often 8s; cold start + warehouse_products + warehouse_inventory + warehouse_inventory_by_size can exceed it.
-- Applies to the current database (all roles using it).

DO $$
DECLARE
  db name := current_database();
BEGIN
  EXECUTE format('ALTER DATABASE %I SET statement_timeout = %L', db, '30s');
END $$;
