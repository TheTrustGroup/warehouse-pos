-- Verify Total Stock Value (run in Supabase SQL Editor)
-- Dashboard "Total Stock Value" = sum(quantity × selling_price) for the selected warehouse.
-- Quantity = by_size sum when present, else warehouse_inventory.quantity.
-- This script recomputes the same value and helps spot inflation (wrong prices, quantity drift).

-- ── 1. What the dashboard uses: value from the view (per warehouse) ──
SELECT
  warehouse_id,
  w.name AS warehouse_name,
  total_products,
  total_units,
  stock_value_at_cost,
  total_stock_value,
  ROUND((total_stock_value)::numeric, 2) AS total_stock_value_rounded
FROM warehouse_dashboard_stats s
JOIN warehouses w ON w.id = s.warehouse_id
ORDER BY w.name;

-- ── 2. Recompute total_stock_value manually (same logic as the view) ──
-- You can compare this to the view. If they match, the view is correct; if the number still feels inflated, check prices/quantities below.
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
    COALESCE(bs.qty, inv.quantity, 0)::numeric AS qty
  FROM products_per_warehouse p
  JOIN warehouse_products wp ON wp.id = p.product_id
  LEFT JOIN inv ON inv.warehouse_id = p.warehouse_id AND inv.product_id = p.product_id
  LEFT JOIN by_size bs ON bs.warehouse_id = p.warehouse_id AND bs.product_id = p.product_id
)
SELECT
  warehouse_id,
  COUNT(*) AS total_products,
  COALESCE(SUM(qty), 0)::bigint AS total_units,
  ROUND((COALESCE(SUM(qty * cost_price), 0))::numeric, 2) AS stock_value_at_cost,
  ROUND((COALESCE(SUM(qty * selling_price), 0))::numeric, 2) AS total_stock_value_recomputed
FROM with_qty
GROUP BY warehouse_id
ORDER BY warehouse_id;

-- ── 3. Top 20 products by stock value (selling price) — find big contributors ──
-- If the total feels inflated, look for very high selling_price or quantity here.
WITH products_per_warehouse AS (
  SELECT DISTINCT warehouse_id, product_id FROM (
    SELECT warehouse_id, product_id FROM warehouse_inventory
    UNION
    SELECT warehouse_id, product_id FROM warehouse_inventory_by_size
  ) t
),
inv AS ( SELECT warehouse_id, product_id, quantity FROM warehouse_inventory ),
by_size AS (
  SELECT warehouse_id, product_id, SUM(quantity) AS qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
),
with_qty AS (
  SELECT
    p.warehouse_id,
    p.product_id,
    wp.name,
    wp.selling_price,
    wp.cost_price,
    COALESCE(bs.qty, inv.quantity, 0)::numeric AS qty
  FROM products_per_warehouse p
  JOIN warehouse_products wp ON wp.id = p.product_id
  LEFT JOIN inv ON inv.warehouse_id = p.warehouse_id AND inv.product_id = p.product_id
  LEFT JOIN by_size bs ON bs.warehouse_id = p.warehouse_id AND bs.product_id = p.product_id
)
SELECT
  w.name AS warehouse_name,
  with_qty.name AS product_name,
  with_qty.qty AS quantity,
  with_qty.selling_price,
  ROUND((with_qty.qty * with_qty.selling_price)::numeric, 2) AS line_value
FROM with_qty
JOIN warehouses w ON w.id = with_qty.warehouse_id
WHERE with_qty.qty > 0 AND with_qty.selling_price > 0
ORDER BY (with_qty.qty * with_qty.selling_price) DESC
LIMIT 20;

-- ── 4. Quantity drift: rows where warehouse_inventory.quantity ≠ sum(warehouse_inventory_by_size) ──
-- Drift can cause wrong (sometimes inflated) totals if the view/RPC use different qty sources.
SELECT
  wi.warehouse_id,
  wi.product_id,
  wp.name AS product_name,
  wi.quantity AS inv_quantity,
  COALESCE(bs.sum_qty, 0) AS by_size_sum,
  wi.quantity - COALESCE(bs.sum_qty, 0) AS drift
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id
LEFT JOIN (
  SELECT warehouse_id, product_id, SUM(quantity)::int AS sum_qty
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
) bs ON bs.warehouse_id = wi.warehouse_id AND bs.product_id = wi.product_id
WHERE wi.quantity IS DISTINCT FROM COALESCE(bs.sum_qty, 0)
ORDER BY drift DESC
LIMIT 30;

-- ── 5. Suspicious selling prices (e.g. > 100,000 GHS per unit — adjust threshold if needed) ──
SELECT id, name, selling_price, cost_price
FROM warehouse_products
WHERE selling_price > 100000
ORDER BY selling_price DESC
LIMIT 20;

-- ── 6. Same-name products (same display name, different product_id) in a warehouse ──
-- Use for review only: multiple product_ids per name can be legitimate (e.g. variants like
-- "Adidas SL 72" in different colourways) or real duplicates to merge (e.g. "Airforce 1 low"
-- vs "Airforce 1 Low" entered twice). Only merge when the same physical SKU was added twice.
WITH with_qty AS (
  SELECT
    wi.warehouse_id,
    wi.product_id,
    wp.name,
    COALESCE(bs.qty, wi.quantity, 0)::numeric AS qty,
    wp.selling_price
  FROM warehouse_inventory wi
  JOIN warehouse_products wp ON wp.id = wi.product_id
  LEFT JOIN (
    SELECT warehouse_id, product_id, SUM(quantity)::numeric AS qty
    FROM warehouse_inventory_by_size
    GROUP BY warehouse_id, product_id
  ) bs ON bs.warehouse_id = wi.warehouse_id AND bs.product_id = wi.product_id
  WHERE wi.quantity > 0 OR COALESCE(bs.qty, 0) > 0
),
dupe_names AS (
  SELECT warehouse_id, TRIM(name) AS name
  FROM with_qty
  GROUP BY warehouse_id, TRIM(name)
  HAVING COUNT(DISTINCT product_id) > 1
)
SELECT
  w.name AS warehouse_name,
  wq.name AS product_name,
  COUNT(*) AS product_ids_with_same_name,
  SUM(wq.qty)::bigint AS total_units_counted,
  ROUND((SUM(wq.qty * wq.selling_price))::numeric, 2) AS total_line_value
FROM with_qty wq
JOIN warehouses w ON w.id = wq.warehouse_id
JOIN dupe_names d ON d.warehouse_id = wq.warehouse_id AND d.name = TRIM(wq.name)
GROUP BY w.name, wq.name, wq.warehouse_id
ORDER BY total_line_value DESC;
