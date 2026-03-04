-- RPC: accurate warehouse-level inventory stats from real data (no limit).
-- Used by GET /api/dashboard so total stock value and counts reflect all products.

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
  WITH products_in_warehouse AS (
    SELECT DISTINCT product_id FROM (
      SELECT product_id FROM warehouse_inventory WHERE warehouse_id = p_warehouse_id
      UNION
      SELECT product_id FROM warehouse_inventory_by_size WHERE warehouse_id = p_warehouse_id
    ) t
  ),
  inv AS (
    SELECT product_id, quantity
    FROM warehouse_inventory
    WHERE warehouse_id = p_warehouse_id
  ),
  by_size AS (
    SELECT product_id, SUM(quantity) AS qty
    FROM warehouse_inventory_by_size
    WHERE warehouse_id = p_warehouse_id
    GROUP BY product_id
  ),
  with_qty AS (
    SELECT
      p.product_id,
      wp.selling_price,
      COALESCE(wp.reorder_level, 0) AS reorder_level,
      COALESCE(
        CASE
          WHEN wp.size_kind = 'sized' AND bs.qty IS NOT NULL THEN bs.qty
          ELSE inv.quantity
        END,
        0
      )::numeric AS qty
    FROM products_in_warehouse p
    JOIN warehouse_products wp ON wp.id = p.product_id
    LEFT JOIN inv ON inv.product_id = p.product_id
    LEFT JOIN by_size bs ON bs.product_id = p.product_id
  )
  SELECT
    COALESCE(SUM(qty * selling_price), 0),
    COUNT(*)::bigint,
    COALESCE(SUM(qty), 0)::bigint,
    COUNT(*) FILTER (WHERE qty > 0 AND qty <= reorder_level)::bigint,
    COUNT(*) FILTER (WHERE qty = 0)::bigint
  FROM with_qty;
$$;

COMMENT ON FUNCTION get_warehouse_inventory_stats(uuid) IS
  'Returns one row: total_stock_value (qty * selling_price), total_products, total_units, low_stock_count, out_of_stock_count for the warehouse. Used for dashboard and inventory stats accuracy.';
