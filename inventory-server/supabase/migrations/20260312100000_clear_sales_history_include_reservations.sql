-- Fix clear_sales_history: sale_reservations references sales, so TRUNCATE sales
-- fails with "cannot truncate a table referenced in a foreign key constraint".
-- Truncate reservation child table first, then sale_lines, then sales.

CREATE OR REPLACE FUNCTION clear_sales_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Child tables first (FK references to sales); then parent. Order matters for TRUNCATE.
  TRUNCATE TABLE sale_reservations, sale_lines, sales;
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'receipt_seq') THEN
    PERFORM setval('public.receipt_seq', 1);
  END IF;
END;
$$;

COMMENT ON FUNCTION clear_sales_history() IS 'Admin-only: truncate sale_reservations, sale_lines, sales; reset receipt_seq.';
