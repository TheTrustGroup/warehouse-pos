-- RPC: Sales report metrics from sales + sale_lines (SQL aggregation).
-- Revenue = SUM(line_total); COGS = SUM(cost_price * qty); profit = revenue - COGS.
-- Used by GET /api/reports/sales so metrics are computed in DB, not in JS.

CREATE OR REPLACE FUNCTION get_sales_report(
  p_warehouse_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue      numeric;
  v_cogs        numeric;
  v_gross_profit numeric;
  v_margin_pct  numeric;
  v_txn_count   bigint;
  v_units_sold  bigint;
  v_aov         numeric;
  v_top         jsonb;
  v_by_day      jsonb;
BEGIN
  -- Core metrics: only completed, non-voided sales in period
  SELECT
    COALESCE(SUM(sl.line_total), 0),
    COALESCE(SUM(sl.qty * COALESCE(sl.cost_price, 0)), 0),
    COUNT(DISTINCT s.id),
    COALESCE(SUM(sl.qty), 0)::bigint
  INTO v_revenue, v_cogs, v_txn_count, v_units_sold
  FROM sales s
  JOIN sale_lines sl ON sl.sale_id = s.id
  WHERE s.warehouse_id = p_warehouse_id
    AND s.status = 'completed'
    AND (s.status IS NULL OR s.status != 'voided')
    AND (p_from IS NULL OR s.created_at >= p_from)
    AND (p_to IS NULL OR s.created_at <= p_to);

  v_revenue      := COALESCE(v_revenue, 0);
  v_cogs         := COALESCE(v_cogs, 0);
  v_gross_profit := v_revenue - v_cogs;
  v_margin_pct   := CASE WHEN v_revenue > 0 THEN round((v_gross_profit / v_revenue * 100)::numeric, 1) ELSE 0 END;
  v_aov          := CASE WHEN v_txn_count > 0 THEN round((v_revenue / v_txn_count)::numeric, 2) ELSE 0 END;

  -- Top 10 products by revenue in period
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'revenue' DESC NULLS LAST), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT jsonb_build_object(
      'productId', sl.product_id,
      'productName', COALESCE(MAX(sl.product_name), ''),
      'unitsSold', SUM(sl.qty),
      'revenue', SUM(sl.line_total),
      'cogs', SUM(sl.qty * COALESCE(sl.cost_price, 0)),
      'profit', SUM(sl.line_total) - SUM(sl.qty * COALESCE(sl.cost_price, 0)),
      'marginPct', CASE WHEN SUM(sl.line_total) > 0
        THEN round(((SUM(sl.line_total) - SUM(sl.qty * COALESCE(sl.cost_price, 0))) / SUM(sl.line_total) * 100)::numeric, 1)
        ELSE 0 END
    ) AS row
    FROM sales s
    JOIN sale_lines sl ON sl.sale_id = s.id
    WHERE s.warehouse_id = p_warehouse_id
      AND s.status = 'completed'
      AND (s.status IS NULL OR s.status != 'voided')
      AND (p_from IS NULL OR s.created_at >= p_from)
      AND (p_to IS NULL OR s.created_at <= p_to)
    GROUP BY sl.product_id
    ORDER BY SUM(sl.line_total) DESC NULLS LAST
    LIMIT 10
  ) sub;

  -- Sales by day (date, revenue, transactions)
  SELECT COALESCE(jsonb_agg(day_row ORDER BY day_row->>'date'), '[]'::jsonb)
  INTO v_by_day
  FROM (
    SELECT jsonb_build_object(
      'date', to_char(day_agg.day, 'YYYY-MM-DD'),
      'revenue', day_agg.revenue,
      'transactions', day_agg.txn_count
    ) AS day_row
    FROM (
      SELECT
        date_trunc('day', s.created_at AT TIME ZONE 'UTC') AS day,
        SUM(s.total)::numeric AS revenue,
        COUNT(*)::bigint AS txn_count
      FROM sales s
      WHERE s.warehouse_id = p_warehouse_id
        AND s.status = 'completed'
        AND (s.status IS NULL OR s.status != 'voided')
        AND (p_from IS NULL OR s.created_at >= p_from)
        AND (p_to IS NULL OR s.created_at <= p_to)
      GROUP BY date_trunc('day', s.created_at AT TIME ZONE 'UTC')
    ) day_agg
  ) day_rows;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'cogs', v_cogs,
    'grossProfit', v_gross_profit,
    'marginPct', v_margin_pct,
    'transactionCount', v_txn_count,
    'unitsSold', v_units_sold,
    'averageOrderValue', v_aov,
    'topProducts', COALESCE(v_top, '[]'::jsonb),
    'salesByDay', COALESCE(v_by_day, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION get_sales_report(uuid, timestamptz, timestamptz) IS
  'Sales report: revenue, COGS, profit, margin, counts, AOV, top products, sales by day. All from sales/sale_lines; computed in SQL.';

-- Post-hardening: revoke from client roles, grant only to service_role (CI invariant).
REVOKE ALL ON FUNCTION public.get_sales_report(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sales_report(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_sales_report(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report(uuid, timestamptz, timestamptz) TO service_role;
