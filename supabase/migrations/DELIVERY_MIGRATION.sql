-- ============================================================
-- DELIVERY_MIGRATION.sql
-- Run in: Supabase Dashboard → SQL Editor
--
-- Adds delivery tracking to the existing sales table.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- Existing sales default to 'delivered' so nothing breaks.
-- ============================================================

-- ── 1. Add delivery columns to sales ──────────────────────────────────────

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_status   text    NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS recipient_name    text,
  ADD COLUMN IF NOT EXISTS recipient_phone   text,
  ADD COLUMN IF NOT EXISTS delivery_address  text,
  ADD COLUMN IF NOT EXISTS delivery_notes    text,
  ADD COLUMN IF NOT EXISTS expected_date     date,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_by      text;

-- delivery_status values:
--   'delivered'   → handed over immediately (default for all existing + new instant sales)
--   'pending'     → paid, awaiting delivery
--   'dispatched'  → on the way (optional)

-- ── 2. Back-fill existing rows ─────────────────────────────────────────────

UPDATE sales
SET delivery_status = 'delivered'
WHERE delivery_status IS NULL OR delivery_status = '';

-- ── 3. Add constraint to prevent invalid values ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_delivery_status_check'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT sales_delivery_status_check
      CHECK (delivery_status IN ('delivered', 'pending', 'dispatched'));
  END IF;
END $$;

-- ── 4. Indexes for the Deliveries page queries ────────────────────────────

-- Fast fetch of pending/dispatched deliveries per warehouse
CREATE INDEX IF NOT EXISTS idx_sales_delivery_status
  ON sales (warehouse_id, delivery_status, expected_date)
  WHERE delivery_status IN ('pending', 'dispatched');

-- Fast sort for sales history (already exists in most setups but ensure it)
CREATE INDEX IF NOT EXISTS idx_sales_created_at
  ON sales (warehouse_id, created_at DESC);

-- ── 5. Verify ─────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'sales'
  AND column_name IN (
    'delivery_status', 'recipient_name', 'recipient_phone',
    'delivery_address', 'delivery_notes', 'expected_date',
    'delivered_at', 'delivered_by'
  )
ORDER BY column_name;
