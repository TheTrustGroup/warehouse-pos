-- Sequence used by record_sale() for receipt IDs (RCP-YYYYMMDD-NNNN).
-- Must exist before first sale. Safe to run multiple times (IF NOT EXISTS).

CREATE SEQUENCE IF NOT EXISTS receipt_seq;

COMMENT ON SEQUENCE receipt_seq IS 'Used by record_sale() for receipt_id suffix (nextval % 10000).';
