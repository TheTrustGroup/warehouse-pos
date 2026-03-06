-- Allow anon to SELECT on tables used by frontend Realtime (postgres_changes).
-- The frontend uses createClient(url, anon_key) with no user JWT, so Realtime runs as anon.
-- Without this, RLS blocks the subscription and the "Live" indicator stays red (CHANNEL_ERROR / no SUBSCRIBED).
-- Restriction: anon key is already in the frontend bundle; API uses service_role. Only our app consumes anon.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_inventory_by_size') THEN
    DROP POLICY IF EXISTS "anon_select_warehouse_inventory_by_size_realtime" ON warehouse_inventory_by_size;
    CREATE POLICY "anon_select_warehouse_inventory_by_size_realtime"
      ON warehouse_inventory_by_size FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales') THEN
    DROP POLICY IF EXISTS "anon_select_sales_realtime" ON sales;
    CREATE POLICY "anon_select_sales_realtime"
      ON sales FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_products') THEN
    DROP POLICY IF EXISTS "anon_select_warehouse_products_realtime" ON warehouse_products;
    CREATE POLICY "anon_select_warehouse_products_realtime"
      ON warehouse_products FOR SELECT TO anon USING (true);
  END IF;
END $$;

COMMENT ON POLICY anon_select_warehouse_inventory_by_size_realtime ON warehouse_inventory_by_size IS 'Realtime postgres_changes: frontend subscribes as anon.';
COMMENT ON POLICY anon_select_sales_realtime ON sales IS 'Realtime postgres_changes: frontend subscribes as anon.';
COMMENT ON POLICY anon_select_warehouse_products_realtime ON warehouse_products IS 'Realtime postgres_changes: frontend subscribes as anon.';
