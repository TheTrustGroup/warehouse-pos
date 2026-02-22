-- Durability/audit log table for product (and future) mutations.
-- Run once per environment. Idempotent (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS durability_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status       text NOT NULL CHECK (status IN ('success', 'failed')),
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  warehouse_id text,
  request_id   text,
  user_role    text,
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_durability_log_entity
  ON durability_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_durability_log_created_at
  ON durability_log (created_at DESC);

COMMENT ON TABLE durability_log IS 'Audit log for mutations (e.g. product update/delete). Written by logDurability().';
