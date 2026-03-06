-- Set admin_email for warehouses that should receive low-stock alerts (8am daily).
-- Run in Supabase SQL Editor. Replace the placeholder with your email and optional warehouse id.

-- Example: set one email for the main warehouse (use your warehouse id from warehouses table)
-- UPDATE warehouses SET admin_email = 'admin@yourstore.com' WHERE id = '00000000-0000-0000-0000-000000000001';

-- Example: set same email for all warehouses
-- UPDATE warehouses SET admin_email = 'admin@yourstore.com';

-- Example: set different emails per warehouse
-- UPDATE warehouses SET admin_email = 'main@store.com' WHERE name ILIKE '%main%';
-- UPDATE warehouses SET admin_email = 'branch@store.com' WHERE name ILIKE '%branch%';

-- Check current values
SELECT id, name, admin_email FROM warehouses ORDER BY name;
