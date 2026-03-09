-- Prevent duplicate products: unique SKU (allow multiple empty; one non-empty SKU per product).
-- Ensure common size codes exist for apparel (XS, S, M, L, XL, OS, NA) so sized products are not rejected.

-- 1. Fix existing duplicates: for each non-empty SKU that appears more than once, make duplicates
--    unique by appending product id so we keep all rows and the index can be created.
UPDATE warehouse_products wp
SET sku = wp.sku || '-' || wp.id
FROM (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at, id) AS rn
    FROM warehouse_products
    WHERE sku IS NOT NULL AND trim(sku) <> ''
  ) t
  WHERE rn > 1
) dups
WHERE wp.id = dups.id;

-- 2. Unique constraint on non-empty SKU so the same SKU cannot be used twice going forward.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_products_sku_unique
  ON warehouse_products(sku)
  WHERE sku IS NOT NULL AND trim(sku) <> '';

COMMENT ON INDEX idx_warehouse_products_sku_unique IS 'Prevent duplicate products: one product per non-empty SKU.';

-- 3. Idempotent seed: ensure common size codes exist (in case DB was created without full seed).
INSERT INTO size_codes (size_code, size_label, size_order) VALUES
  ('NA', 'N/A', -100),
  ('OS', 'One Size', -99),
  ('XS', 'XS', 20),
  ('S', 'S', 21),
  ('M', 'M', 22),
  ('L', 'L', 23),
  ('XL', 'XL', 24),
  ('XXL', 'XXL', 25)
ON CONFLICT (size_code) DO NOTHING;
