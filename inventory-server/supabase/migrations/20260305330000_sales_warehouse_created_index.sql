-- Dashboard perf + correctness:
-- - today-by-warehouse aggregates ALL warehouses for a day (filter by created_at)
-- - per-warehouse todaySales filters by (warehouse_id, created_at) and is already indexed elsewhere
--
-- This migration adds:
-- 1) An index that supports created_at range filters for daily rollups
-- 2) An RPC to aggregate in SQL (avoid fetching all rows to the serverless function)

CREATE INDEX IF NOT EXISTS idx_sales_created_at_warehouse_id_desc
ON public.sales (created_at DESC, warehouse_id);

COMMENT ON INDEX idx_sales_created_at_warehouse_id_desc IS 'Supports dashboard today-by-warehouse rollups by created_at range.';

CREATE OR REPLACE FUNCTION public.get_today_sales_by_warehouse(p_date date)
RETURNS TABLE (warehouse_id uuid, revenue numeric, sales bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.warehouse_id,
    COALESCE(SUM(s.total), 0)::numeric AS revenue,
    COUNT(*)::bigint AS sales
  FROM public.sales s
  WHERE s.created_at >= (p_date::timestamp AT TIME ZONE 'UTC')
    AND s.created_at < ((p_date + 1)::timestamp AT TIME ZONE 'UTC')
  GROUP BY s.warehouse_id;
$$;

COMMENT ON FUNCTION public.get_today_sales_by_warehouse(date) IS 'Aggregates sales totals per warehouse for a UTC day. Used by /api/dashboard/today-by-warehouse.';
