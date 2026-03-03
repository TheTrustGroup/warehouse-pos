-- Index for getScopeForUser(email): fast lookup by user_email so /api/products and other routes don't block on scope resolution.
-- Safe: only runs if user_scopes exists; IF NOT EXISTS so re-run is no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_scopes') THEN
    CREATE INDEX IF NOT EXISTS idx_user_scopes_user_email ON user_scopes (user_email);
  END IF;
END $$;
