-- VERIFY 2 — View exists (run this alone). Should return 1 row.
SELECT viewname FROM pg_views
WHERE schemaname = 'public' AND viewname = 'warehouse_dashboard_stats';
