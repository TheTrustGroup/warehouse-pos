-- Drop the older record_sale that lacks delivery support (oid 200584)
-- Keep only the newer one with p_delivery_schedule parameter
DROP FUNCTION IF EXISTS record_sale(
  uuid, jsonb, numeric, numeric, numeric, numeric, text,
  text, uuid, text, text
);
