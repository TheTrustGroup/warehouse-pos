-- Harden SECURITY DEFINER functions in public schema.
-- Goal: prevent privilege escalation via PostgREST RPC calls.
-- Policy: SECURITY DEFINER functions must not be executable by PUBLIC, anon, or authenticated.
-- If you intentionally need a client-callable RPC, do NOT make it SECURITY DEFINER; keep it SECURITY INVOKER + RLS-safe.

DO $$
DECLARE
  r record;
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_authenticated boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
  has_service_role boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC;',
      r.schema_name,
      r.function_name,
      r.identity_args
    );

    IF has_anon THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon;',
        r.schema_name,
        r.function_name,
        r.identity_args
      );
    END IF;

    IF has_authenticated THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated;',
        r.schema_name,
        r.function_name,
        r.identity_args
      );
    END IF;

    IF has_service_role THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role;',
        r.schema_name,
        r.function_name,
        r.identity_args
      );
    END IF;
  END LOOP;
END $$;

