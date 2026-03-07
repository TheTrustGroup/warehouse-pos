-- Phase 2 Step 2A: Verify every user has correct warehouse in user_scopes.
-- Run this in Supabase SQL Editor (copy the whole block, no markdown).

SELECT
  u.email,
  us.warehouse_id,
  w.name AS warehouse_name,
  u.raw_user_meta_data->>'warehouseId' AS meta_id
FROM auth.users u
LEFT JOIN user_scopes us ON LOWER(TRIM(us.user_email)) = LOWER(TRIM(u.email))
LEFT JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY u.email;
