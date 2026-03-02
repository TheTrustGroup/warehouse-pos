# Environment variables and secrets

**Purpose:** Single place to see what the API server needs and how to keep secrets safe.

---

## Where to set them

- **Local:** Copy `inventory-server/.env.example` to `inventory-server/.env.local` and fill in values. Never commit `.env.local` or any file containing real keys.
- **Production (e.g. Vercel):** Set each variable in the project’s Environment Variables. Use production values only for production env; keep staging/dev separate.

---

## Required for the API

| Variable | Description | Rotation |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Change if you migrate or recreate the project |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | Rotate in Supabase Dashboard → Settings → API; then update env everywhere |
| `SESSION_SECRET` or `JWT_SECRET` | Min 16 characters; used to sign session JWTs | Rotate if leaked or when someone leaves; all users will need to log in again |

---

## Optional

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAILS` / `SUPER_ADMIN_EMAILS` | Comma-separated emails that get admin role at login |
| `ALLOWED_WAREHOUSE_IDS` | Fallback when `user_scopes` table is empty |
| `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES` | Extra CORS origins |
| `SALES_JWT_SECRET` | Alternative JWT signing key for custom tokens |

---

## Rotation checklist

1. Generate a new secret (e.g. `openssl rand -base64 24` for SESSION_SECRET).
2. Update the value in your hosting env (and optionally in Supabase for the service role key).
3. Deploy or restart the API so the new value is used.
4. If you rotated SESSION_SECRET/JWT_SECRET: all existing session tokens are invalid; users must log in again (expected).

---

## RLS and service role

The API server uses **Supabase with the service role key** (`SUPABASE_SERVICE_ROLE_KEY`). All server-side Supabase client calls therefore **bypass Row Level Security (RLS)**. Authorization is enforced in the API layer (e.g. `requireAuth`, `getEffectiveWarehouseId`, `getScopeForUser`), not in the database.

- **Do not** use the Supabase anon key from the frontend for direct mutable access to `warehouse_products`, `sales`, or `warehouse_inventory`. If you add a direct Supabase client in the browser (e.g. for Realtime), use the anon key and rely on RLS so that clients only see data allowed by policy.
- **If you enable or tighten RLS** on tables that the API writes to, the API will continue to work (service role bypasses RLS). RLS then protects only direct client access (e.g. Supabase JS client with anon key).

---

## Frontend (Vite)

The frontend uses `VITE_*` variables (e.g. `VITE_API_BASE_URL`, `VITE_SUPER_ADMIN_EMAILS`). These are embedded in the client bundle. Do not put API secrets or service-role keys in `VITE_*` variables.
