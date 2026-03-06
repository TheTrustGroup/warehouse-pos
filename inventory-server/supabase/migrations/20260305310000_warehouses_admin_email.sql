-- Add optional admin_email to warehouses for low-stock alert (NEXT 2).
-- When set, the 8am low-stock-alert Edge Function sends the daily email to this address.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'admin_email'
  ) THEN
    ALTER TABLE warehouses ADD COLUMN admin_email text;
  END IF;
END $$;

COMMENT ON COLUMN warehouses.admin_email IS 'Optional email for daily low-stock alerts (8am). If null, no alert is sent for this warehouse unless LOW_STOCK_ALERT_EMAIL fallback is set.';
