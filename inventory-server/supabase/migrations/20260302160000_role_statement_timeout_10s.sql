-- Stricter statement_timeout for Supabase API roles (10s). DB-level remains 30s for other use.
ALTER ROLE authenticator SET statement_timeout = '10s';
ALTER ROLE anon SET statement_timeout = '10s';
ALTER ROLE authenticated SET statement_timeout = '10s';
