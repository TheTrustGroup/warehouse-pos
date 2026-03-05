-- Resolve "Could not choose the best candidate function between" when POST /api/sales
-- calls record_sale with 10 args. Drop all overloads except the 10-param one (from
-- 20260305140000) so the API call has exactly one candidate.

DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid);

COMMENT ON FUNCTION record_sale(uuid, jsonb, numeric, numeric, numeric, numeric, text, text, uuid, text) IS
  'Record sale + lines (with cost_price at time of sale) + deduct stock atomically. Single overload so API 10-arg call resolves.';
