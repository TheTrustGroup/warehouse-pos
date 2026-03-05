-- Capture cost at time of sale for accurate COGS and profit in reports.
-- sale_lines.cost_price = warehouse_products.cost_price when the line is inserted by record_sale.

ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);

COMMENT ON COLUMN sale_lines.cost_price IS 'Cost per unit at time of sale (from warehouse_products). Used for COGS and profit; NULL for legacy rows.';

-- Backfill: set cost_price from current product where NULL (best-effort for historical rows)
UPDATE sale_lines sl
SET cost_price = wp.cost_price
FROM warehouse_products wp
WHERE sl.product_id = wp.id
  AND sl.cost_price IS NULL;
