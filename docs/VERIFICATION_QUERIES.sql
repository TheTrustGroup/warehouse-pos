-- =============================================================================
-- Verification Phase — Run in Supabase SQL Editor (BOTH projects)
--
-- Connection timeout fix: DO NOT run this whole file at once.
-- Use the single-query files in docs/verification/ and run ONE file at a time:
--
--   1. docs/verification/VERIFY_1_trigger.sql
--   2. docs/verification/VERIFY_2_view.sql
--   3. docs/verification/VERIFY_2_view_data.sql
--   4. docs/verification/VERIFY_3_realtime.sql
--   5. docs/verification/VERIFY_4_storage.sql
--   6. docs/verification/VERIFY_5_rpc.sql
--   7. docs/verification/VERIFY_6_cron.sql
--
-- Or copy-paste ONE block below at a time into the SQL editor.
-- =============================================================================

-- Block 1 — Trigger (run alone)
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'warehouse_inventory_by_size'
ORDER BY trigger_name;

-- Block 2 — View exists (run alone)
SELECT viewname FROM pg_views
WHERE schemaname = 'public' AND viewname = 'warehouse_dashboard_stats';

-- Block 3 — View data (run alone)
SELECT * FROM warehouse_dashboard_stats;

-- Block 4 — Realtime (run alone)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;

-- Block 5 — Storage (run alone)
SELECT name, created_at FROM storage.objects
WHERE bucket_id = 'product-images' ORDER BY created_at DESC LIMIT 10;

-- Block 6 — RPC (run alone)
SELECT proname, pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'receive_delivery' AND pronamespace = 'public'::regnamespace;

-- Block 7 — pg_cron (run alone)
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
