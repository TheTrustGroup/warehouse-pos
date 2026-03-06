-- VERIFY 5 — receive_delivery RPC (run this alone). Should return 1 row.
SELECT proname, pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'receive_delivery' AND pronamespace = 'public'::regnamespace;
