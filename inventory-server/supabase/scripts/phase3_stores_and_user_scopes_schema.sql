-- Phase 3: stores, user_scopes, and warehouses.store_id
-- Required for: warehouse switcher, GET /api/warehouses, GET/POST /api/products scope checks.
-- Run in Supabase SQL Editor. Idempotent — safe to run multiple times.

-- 1. Stores table (optional parent for warehouses; Dashboard "Warehouse → Store" uses this)
CREATE TABLE IF NOT EXISTS stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. user_scopes: which stores/warehouses a user (by email) can access
-- No rows = unrestricted (all warehouses). Rows = user only sees those warehouses.
CREATE TABLE IF NOT EXISTS user_scopes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   text NOT NULL,
  store_id     uuid REFERENCES stores(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  pos_id       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_scopes_user_email ON user_scopes (user_email);

-- 3. Link warehouses to a store (optional). Add column if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE warehouses ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_warehouses_store_id ON warehouses (store_id);
  END IF;
END $$;

COMMENT ON TABLE stores IS 'Phase 3: store/location group; warehouses can belong to a store.';
COMMENT ON TABLE user_scopes IS 'Phase 3: which stores/warehouses a user (by email) can access. Empty = unrestricted.';
