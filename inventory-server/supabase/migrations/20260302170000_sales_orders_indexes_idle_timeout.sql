-- Performance: indexes for sales/deliveries/dashboard queries and zombie connection prevention.
-- Run in Supabase SQL Editor or via migration.

-- Sales (dashboard + deliveries page)
CREATE INDEX IF NOT EXISTS idx_sales_warehouse_created
  ON public.sales (warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_warehouse_status
  ON public.sales (warehouse_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_delivery_status
  ON public.sales (warehouse_id, delivery_status);

-- Sale lines (POS receipt lookup)
CREATE INDEX IF NOT EXISTS idx_sale_lines_sale_id
  ON public.sale_lines (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_lines_product_id
  ON public.sale_lines (product_id);

-- Orders (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_warehouse_created ON public.orders (warehouse_id, created_at DESC);
  END IF;
END $$;

-- Prevent zombie connections: auto-kill idle in-transaction sessions
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';
