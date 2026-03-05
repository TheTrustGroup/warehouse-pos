-- Resolve "Could not choose the best candidate function between void_sale(uuid) and void_sale(uuid, text)".
-- POST /api/sales/void calls void_sale with one arg (p_sale_id). Drop the 2-param overload so the call resolves.

DROP FUNCTION IF EXISTS void_sale(uuid, text);

COMMENT ON FUNCTION void_sale(uuid) IS 'Void a completed sale: restore stock from sale_lines then set status to voided. Idempotent if already voided. Single overload so API 1-arg call resolves.';
