-- VERIFY 3 — Realtime publication (run this alone). Should list 4 tables.
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
