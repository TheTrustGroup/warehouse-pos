-- Fix "new row for relation sales violates check constraint sales_payment_method_check".
-- Allow only cash, card, mobile_money, mixed (case-insensitive so existing rows and any casing work).

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (lower(trim(payment_method)) IN ('cash', 'card', 'mobile_money', 'mixed'));

COMMENT ON CONSTRAINT sales_payment_method_check ON sales IS
  'Allowed: cash, card, mobile_money, mixed (case-insensitive). API sends lowercase.';
