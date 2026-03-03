-- One-time cleanup: kill zombie/aborted connections in the current database.
-- Run in Supabase SQL Editor when you need to clear stuck sessions.
-- The ALTER ROLEs are also in migration 20260302170000; run this script once to clean up + enforce.

-- Kill matching backends (never kills the current connection: pid <> pg_backend_pid())
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND (
    state = 'idle in transaction (aborted)'
    OR (state = 'idle' AND query = 'LISTEN "pgrst"'
        AND query_start < now() - interval '30 minutes')
    OR (state = 'idle in transaction'
        AND query_start < now() - interval '5 minutes')
  );

-- Permanently prevent new zombies (30s idle-in-transaction → session killed)
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '30s';
