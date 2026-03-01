-- Optional product color for filtering (admin + POS).
-- Safe: column is nullable; existing rows unchanged.
ALTER TABLE warehouse_products
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN warehouse_products.color IS 'Product color for filter/search (e.g. Red, Black, White).';
