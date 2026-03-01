-- Optional: set color = 'Uncategorized' for products that have no color.
-- Run this if you want existing products to appear when filtering by "Uncategorized" in the UI.
-- Safe to run multiple times (only updates rows where color IS NULL).
UPDATE warehouse_products
SET color = 'Uncategorized'
WHERE color IS NULL;
