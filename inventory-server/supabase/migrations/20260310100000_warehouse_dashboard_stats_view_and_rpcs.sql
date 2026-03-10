-- Dashboard stats: view and RPCs used by GET /api/dashboard and GET /api/dashboard/today-by-warehouse.
-- Without this migration, those routes fall back to heavier queries or fail (500) if fallbacks also fail.
-- View: warehouse_dashboard_stats — one row per warehouse (total_stock_value, counts).
-- RPC: get_warehouse_inventory_stats(p_warehouse_id) — same stats for one warehouse.
-- RPC: get_today_sales_by_warehouse(p_date) — today's revenue per warehouse for a given date.
-- Drop first so we can recreate with correct column order (REPLACE fails if existing view has different column order).

DROP FUNCTION IF EXISTS get_warehouse_inventory_stats(uuid);
DROP VIEW IF EXISTS warehouse_dashboard_stats;

-- ── 1. View: warehouse_dashboard_stats ──
-- Quantity per (warehouse_id, product_id): COALESCE(by_size sum, warehouse_inventory.quantity, 0).
-- Stock value = sum(qty * selling_price). Low stock = qty > 0 AND qty <= reorder_level. Out of stock = qty = 0.
CREATE VIEW warehouse_dashboard_stats AS
WITH products_per_warehouse AS (
  SELECT DISTINCT warehouse_id, product_id
  FROM (
    SELECT warehouse_id, product_id FROM warehouse_inventory
    UNION
    SELECT warehouse_id, product_id FROM warehouse_inventory_by_size
  ) t
),
inv AS (
  SELECT warehouse_id, product_id, quantity
  FROM warehouse_inventory
),
by_size AS (
  SELECT warehouse_id, product_id, SUM(quantity)::numeric AS qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
),
with_qty AS (
  SELECT
    p.warehouse_id,
    p.product_id,
    wp.selling_price,
    wp.cost_price,
    COALESCE(wp.reorder_level, 0)::numeric AS reorder_level,
    COALESCE(bs.qty, inv.quantity, 0)::numeric AS qty
  FROM products_per_warehouse p
  JOIN warehouse_products wp ON wp.id = p.product_id
  LEFT JOIN inv ON inv.warehouse_id = p.warehouse_id AND inv.product_id = p.product_id
  LEFT JOIN by_size bs ON bs.warehouse_id = p.warehouse_id AND bs.product_id = p.product_id
)
SELECT
  warehouse_id,
  COUNT(*)::bigint AS total_products,
  COALESCE(SUM(qty), 0)::bigint AS total_units,
  ROUND(COALESCE(SUM(qty * cost_price), 0)::numeric, 2) AS stock_value_at_cost,
  ROUND(COALESCE(SUM(qty * selling_price), 0)::numeric, 2) AS total_stock_value,
  COUNT(*) FILTER (WHERE qty > 0 AND qty <= reorder_level)::bigint AS low_stock_count,
  COUNT(*) FILTER (WHERE qty = 0)::bigint AS out_of_stock_count
FROM with_qty
GROUP BY warehouse_id;

COMMENT ON VIEW warehouse_dashboard_stats IS 'One row per warehouse: stock value, product/unit counts, low-stock and out-of-stock counts. Used by GET /api/dashboard.';


-- ── 2. RPC: get_warehouse_inventory_stats ──
CREATE OR REPLACE FUNCTION get_warehouse_inventory_stats(p_warehouse_id uuid)
RETURNS TABLE (
  total_stock_value numeric,
  total_products bigint,
  total_units bigint,
  low_stock_count bigint,
  out_of_stock_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.total_stock_value,
    s.total_products,
    s.total_units,
    s.low_stock_count,
    s.out_of_stock_count
  FROM warehouse_dashboard_stats s
  WHERE s.warehouse_id = p_warehouse_id;
$$;

COMMENT ON FUNCTION get_warehouse_inventory_stats(uuid) IS 'Returns dashboard stats for one warehouse. Used by GET /api/dashboard when view is queried per warehouse.';


-- ── 3. RPC: get_today_sales_by_warehouse ──
-- p_date: date as 'YYYY-MM-DD'. Returns one row per warehouse with sum(sales.total) for that date.
CREATE OR REPLACE FUNCTION get_today_sales_by_warehouse(p_date text)
RETURNS TABLE (warehouse_id uuid, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.warehouse_id,
    ROUND(COALESCE(SUM(s.total), 0)::numeric, 2) AS revenue
  FROM sales s
  WHERE s.created_at >= (p_date::date AT TIME ZONE 'UTC')
    AND s.created_at <  (p_date::date + 1) AT TIME ZONE 'UTC'
  GROUP BY s.warehouse_id;
$$;

COMMENT ON FUNCTION get_today_sales_by_warehouse(text) IS 'Returns today''s sales total per warehouse for date YYYY-MM-DD. Used by GET /api/dashboard/today-by-warehouse.';


-- Grant read to service_role (API uses service role key)
GRANT SELECT ON warehouse_dashboard_stats TO service_role;
REVOKE ALL ON warehouse_dashboard_stats FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION get_warehouse_inventory_stats(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION get_warehouse_inventory_stats(uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION get_today_sales_by_warehouse(text) TO service_role;
REVOKE EXECUTE ON FUNCTION get_today_sales_by_warehouse(text) FROM anon, authenticated;
