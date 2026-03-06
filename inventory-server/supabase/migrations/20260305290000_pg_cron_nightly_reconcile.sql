-- Nightly reconciliation: set warehouse_inventory.quantity = SUM(warehouse_inventory_by_size.quantity)
-- for any row where they differ. Safety net in case trigger was bypassed or drift occurred.
-- Requires: Enable "pg_cron" in Supabase Dashboard → Database → Extensions, then run this migration.

-- Ensure pg_cron is available (Supabase enables it in pg_catalog; if missing, enable in Dashboard).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove existing job if re-running migration (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-warehouse-inventory-nightly') THEN
    PERFORM cron.unschedule('reconcile-warehouse-inventory-nightly');
  END IF;
END
$$;

-- Schedule daily at 2:00 AM UTC.
SELECT cron.schedule(
  'reconcile-warehouse-inventory-nightly',
  '0 2 * * *',
  $$
  UPDATE warehouse_inventory wi
  SET quantity = sub.real_total
  FROM (
    SELECT warehouse_id, product_id, COALESCE(SUM(quantity), 0)::int AS real_total
    FROM warehouse_inventory_by_size
    GROUP BY warehouse_id, product_id
  ) sub
  WHERE wi.warehouse_id = sub.warehouse_id
    AND wi.product_id = sub.product_id
    AND wi.quantity IS DISTINCT FROM sub.real_total
  $$
);
