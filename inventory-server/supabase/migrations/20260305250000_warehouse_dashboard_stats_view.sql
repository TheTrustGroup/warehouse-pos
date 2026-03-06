-- View: one row per warehouse with precomputed dashboard metrics.
-- Replaces/supplements get_warehouse_inventory_stats RPC: one SELECT gives instant stats.
-- Quantity derived from by_size sum when present, else warehouse_inventory.quantity (trigger keeps inv in sync).

CREATE OR REPLACE VIEW warehouse_dashboard_stats AS
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
  SELECT warehouse_id, product_id, SUM(quantity) AS qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
),
with_qty AS (
  SELECT
    p.warehouse_id,
    p.product_id,
    wp.selling_price,
    wp.cost_price,
    COALESCE(wp.reorder_level, 0) AS reorder_level,
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
  COALESCE(SUM(qty * cost_price), 0)::numeric AS stock_value_at_cost,
  COALESCE(SUM(qty * selling_price), 0)::numeric AS total_stock_value,
  COUNT(*) FILTER (WHERE qty = 0)::bigint AS out_of_stock_count,
  COUNT(*) FILTER (WHERE qty > 0 AND qty <= reorder_level)::bigint AS low_stock_count
FROM with_qty
GROUP BY warehouse_id;

COMMENT ON VIEW warehouse_dashboard_stats IS 'One row per warehouse: total_products, total_units, total_stock_value (at selling_price), stock_value_at_cost, out_of_stock_count, low_stock_count. Used by GET /api/dashboard.';
