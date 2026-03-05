-- RPC for admin API: clear all sales and delivery history in one shot (same DB the app uses).
-- POST /api/admin/clear-sales-history calls this so the app always clears the right database.

CREATE OR REPLACE FUNCTION clear_sales_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE sale_lines, sales;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'receipt_seq') THEN
    PERFORM setval('receipt_seq', 1);
  END IF;
END;
$$;

COMMENT ON FUNCTION clear_sales_history() IS 'Admin-only: truncate sale_lines and sales, reset receipt_seq. Called by POST /api/admin/clear-sales-history.';

REVOKE ALL ON FUNCTION clear_sales_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_sales_history() TO service_role;
