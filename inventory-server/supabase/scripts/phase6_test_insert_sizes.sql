-- PHASE 6: Force test insert — proves schema allows size_kind + warehouse_inventory_by_size.
-- Run this in Supabase SQL Editor. Uses the same default warehouse as the app (DEFAULT_WAREHOUSE_ID).
-- Idempotent: deletes existing "Test Product Sizes" first so you can re-run safely.

-- Default warehouse ID (must match app/server so list shows this product with sizes)
-- If your DB uses a different default, replace this UUID or ensure this warehouse exists.
-- INSERT into warehouses (id, name, code, ...) VALUES ('00000000-0000-0000-0000-000000000001', 'Main', 'MAIN', ...) if missing.

-- 1. Clean up any previous test row (by name)
DELETE FROM warehouse_inventory_by_size
WHERE product_id IN (SELECT id FROM warehouse_products WHERE name = 'Test Product Sizes');
DELETE FROM warehouse_inventory
WHERE product_id IN (SELECT id FROM warehouse_products WHERE name = 'Test Product Sizes');
DELETE FROM warehouse_products WHERE name = 'Test Product Sizes';

-- 2. Insert product with size_kind = 'sized'
INSERT INTO warehouse_products (
  id, sku, barcode, name, description, category, tags,
  cost_price, selling_price, reorder_level, location, supplier, images, expiry_date,
  created_by, created_at, updated_at, version, size_kind
)
VALUES (
  gen_random_uuid(),
  'TEST-SIZE-' || substr(gen_random_uuid()::text, 1, 8),
  '',
  'Test Product Sizes',
  '',
  '',
  '[]'::jsonb,
  0, 0, 0,
  '{"warehouse":"","aisle":"","rack":"","bin":""}'::jsonb,
  '{"name":"","contact":"","email":""}'::jsonb,
  '[]'::jsonb,
  NULL,
  '',
  now(), now(), 0,
  'sized'
);

-- 3. Insert by_size rows (S, M, L) for default warehouse
INSERT INTO warehouse_inventory_by_size (warehouse_id, product_id, size_code, quantity, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  wp.id,
  s.code,
  s.qty,
  now()
FROM warehouse_products wp
CROSS JOIN (VALUES ('S', 1), ('M', 2), ('L', 3)) AS s(code, qty)
WHERE wp.name = 'Test Product Sizes';

-- 4. Insert total into warehouse_inventory (so list shows quantity)
INSERT INTO warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, wp.id, 6, now()
FROM warehouse_products wp
WHERE wp.name = 'Test Product Sizes'
ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = 6, updated_at = now();

-- 5. Verify: should return one row with size_kind = 'sized' and by_size with 3 entries
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  (SELECT jsonb_agg(jsonb_build_object('size_code', wibs.size_code, 'quantity', wibs.quantity))
   FROM warehouse_inventory_by_size wibs
   WHERE wibs.product_id = wp.id
     AND wibs.warehouse_id = '00000000-0000-0000-0000-000000000001'::uuid) AS by_size
FROM warehouse_products wp
WHERE wp.name = 'Test Product Sizes';

-- If you see size_kind = 'sized' and by_size = [{"size_code":"S","quantity":1}, ...] → DB write path is fine.
-- To remove the test product after: run the three DELETE statements at the top again (or delete by the id shown above).
--
-- If the product still does not show in the app:
-- 1. Same DB: app must use this Supabase project (check .env SUPABASE_URL vs Supabase dashboard URL).
-- 2. Default warehouse: this script uses 00000000-0000-0000-0000-000000000001; app uses that when no warehouse is selected. If your DB has no row with that id, insert it or change the UUIDs above to your real default warehouse id.
-- 3. Bypass cache: on the Inventory page use a full refresh (e.g. Ctrl+Shift+R / Cmd+Shift+R) or wait 60s and reload so the list is refetched from the server.
-- 4. Network: in DevTools → Network, reload, find GET .../api/products?warehouse_id=... and open Response. If "Test Product Sizes" is in the JSON, the backend is correct and the issue is UI/cache.