-- RLS on all business data tables.
-- Policy: service_role has full access (API continues to work); anon and authenticated have no access.
-- Run after all table-creation migrations. Uses IF EXISTS so missing tables (optional migrations) do not fail the run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Sales and sale_lines: remove authenticated access (keep service_role only)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "auth_all_sales"      ON sales;
DROP POLICY IF EXISTS "auth_all_sale_lines" ON sale_lines;

-- service_all_sales / service_sale_lines already exist from 20250222130000; no change needed.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. warehouse_products, warehouse_inventory, warehouse_inventory_by_size
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_products') THEN
    ALTER TABLE warehouse_products ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_warehouse_products" ON warehouse_products;
    CREATE POLICY "service_role_warehouse_products" ON warehouse_products FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_inventory') THEN
    ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_warehouse_inventory" ON warehouse_inventory;
    CREATE POLICY "service_role_warehouse_inventory" ON warehouse_inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouse_inventory_by_size') THEN
    ALTER TABLE warehouse_inventory_by_size ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_warehouse_inventory_by_size" ON warehouse_inventory_by_size;
    CREATE POLICY "service_role_warehouse_inventory_by_size" ON warehouse_inventory_by_size FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. warehouses, stores, user_scopes
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
    ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_warehouses" ON warehouses;
    CREATE POLICY "service_role_warehouses" ON warehouses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stores') THEN
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_stores" ON stores;
    CREATE POLICY "service_role_stores" ON stores FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_scopes') THEN
    ALTER TABLE user_scopes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_user_scopes" ON user_scopes;
    CREATE POLICY "service_role_user_scopes" ON user_scopes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. size_codes (reference data)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'size_codes') THEN
    ALTER TABLE size_codes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_size_codes" ON size_codes;
    CREATE POLICY "service_role_size_codes" ON size_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. transactions, transaction_items, stock_movements
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_transactions" ON transactions;
    CREATE POLICY "service_role_transactions" ON transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transaction_items') THEN
    ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_transaction_items" ON transaction_items;
    CREATE POLICY "service_role_transaction_items" ON transaction_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_movements') THEN
    ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_role_stock_movements" ON stock_movements;
    CREATE POLICY "service_role_stock_movements" ON stock_movements FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
