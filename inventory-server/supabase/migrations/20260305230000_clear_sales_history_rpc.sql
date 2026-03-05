-- RPC for admin API: clear all sales and delivery history in one shot (same DB the app uses).
-- POST /api/admin/clear-sales-history calls this (with confirmation body). Requires admin role at API layer.

CREATE OR REPLACE FUNCTION clear_sales_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Child table first to satisfy FK; then parent. Order matters for TRUNCATE without CASCADE.
  TRUNCATE TABLE sale_lines, sales;
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'receipt_seq') THEN
    PERFORM setval('public.receipt_seq', 1);
  END IF;
END;
$$;

COMMENT ON FUNCTION clear_sales_history() IS 'Admin-only: truncate sale_lines and sales, reset receipt_seq. Called by POST /api/admin/clear-sales-history with confirm body.';

REVOKE ALL ON FUNCTION clear_sales_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_sales_history() TO service_role;
