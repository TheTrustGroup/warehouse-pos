-- ============================================================
-- ADD_DELIVERY_CANCELLED.sql
-- Run in: Supabase Dashboard → SQL Editor
--
-- Adds 'cancelled' to allowed delivery_status so scheduled
-- deliveries can be cancelled (e.g. customer changed mind, not fulfilled).
-- Safe to run once (drops then re-adds constraint).
-- ============================================================

-- Drop existing check so we can add the new one
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_delivery_status_check;

-- Re-add with 'cancelled' allowed
ALTER TABLE sales
  ADD CONSTRAINT sales_delivery_status_check
  CHECK (delivery_status IN ('delivered', 'pending', 'dispatched', 'cancelled'));

-- Optional: index for filtering cancelled (if you query by cancelled often)
CREATE INDEX IF NOT EXISTS idx_sales_delivery_cancelled
  ON sales (warehouse_id, created_at DESC)
  WHERE delivery_status = 'cancelled';
