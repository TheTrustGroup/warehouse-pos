-- Verify user_scopes after seed. Run in Supabase SQL Editor.
-- Expected: cashier → Main Store + Main Store (MAIN); maintown_cashier → Main Town + Main Town (MAINTOWN).

SELECT
  us.user_email,
  s.name AS store_name,
  w.name AS warehouse_name,
  w.code AS warehouse_code
FROM user_scopes us
JOIN stores s ON s.id = us.store_id
JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY us.user_email;
