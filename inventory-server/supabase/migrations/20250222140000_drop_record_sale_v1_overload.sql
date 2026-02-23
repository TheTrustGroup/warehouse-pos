-- Drop the v1 record_sale overload (8 params: warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, lines).
-- Keeps only the v2 overload (9 params) used by POST /api/sales. Fixes "Could not choose the best candidate function" when both existed.
DROP FUNCTION IF EXISTS record_sale(uuid, text, text, numeric, numeric, numeric, numeric, jsonb);
