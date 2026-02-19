-- One-time fix: products with size_kind = 'sized' but only ONESIZE in warehouse_inventory_by_size.
-- Converts them to one_size: delete the ONESIZE by_size row (total stays in warehouse_inventory), set size_kind = 'one_size'.
-- Run in Supabase SQL Editor.

-- 1) Delete ONESIZE row when it's the only by_size row for that product/warehouse (product is effectively one-size)
DELETE FROM warehouse_inventory_by_size wibs
USING warehouse_products wp
WHERE wibs.product_id = wp.id
  AND wp.size_kind = 'sized'
  AND upper(trim(replace(wibs.size_code, ' ', ''))) IN ('ONESIZE', 'ONE_SIZE')
  AND (
    SELECT count(*) FROM warehouse_inventory_by_size w2
    WHERE w2.product_id = wibs.product_id AND w2.warehouse_id = wibs.warehouse_id
  ) = 1;

-- 2) Set those products to one_size (they now have no by_size rows; list RPC will show "One size" from total)
UPDATE warehouse_products wp
SET size_kind = 'one_size',
    updated_at = now()
WHERE wp.size_kind = 'sized'
  AND NOT EXISTS (
    SELECT 1 FROM warehouse_inventory_by_size wibs WHERE wibs.product_id = wp.id
  );
