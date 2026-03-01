# Test and Deploy — Senior Engineer Runbook

Precise, repeatable steps. Run from repo root or the stated directory.

---

## Test results (latest run)

| Step | Result |
|------|--------|
| Frontend `npm run test` | 18 files, 113 tests passed |
| Frontend `npm run build` | ✓ built (VITE_API_BASE_URL set) |
| API `npm run build` | ✓ Compiled successfully, 8/8 static pages |

---

## Part 1 — Test (pre-deploy)

### 1.1 Frontend (warehouse-pos)

```bash
cd warehouse-pos
npm install
npm run test
```

**Expected:** `Test Files 18 passed (18)`, `Tests 113 passed (113)`. Exit code 0.

```bash
VITE_API_BASE_URL=https://your-api-url.example.com npm run build
```

**Expected:** `✓ built in …`, exit code 0. Use your real API URL for production builds so the bundle has the correct base URL, or a placeholder (e.g. `https://placeholder.example.com`) for CI-only builds.

### 1.2 API (inventory-server)

```bash
cd warehouse-pos/inventory-server
npm install
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co SUPABASE_SERVICE_ROLE_KEY=placeholder npm run build
```

**Expected:** `✓ Compiled successfully`, `✓ Generating static pages (8/8)`. Exit code 0.

**Optional — health check (requires port 3001 free):**

```bash
npm run start &
sleep 12
BASE_URL=http://localhost:3001 node scripts/health-check.mjs
pkill -f "next start" 2>/dev/null || true
```

**Expected:** health-check exits 0 (GET /api/health returns `{ "status": "ok" }`).

### 1.3 CI (GitHub Actions)

On push or PR to `main`, Actions run:

- **frontend:** install → test → build (uses `vars.VITE_API_BASE_URL` or placeholder).
- **api:** install → build → start → health check (placeholder Supabase env).
- **e2e:** only if `vars.PLAYWRIGHT_BASE_URL` is set.

Ensure repo variables (or env) are set as in `.github/workflows/ci.yml` if you rely on CI for gate-keeping.

---

## Part 2 — Deploy

### 2.1 Prerequisites (one-time / when schema or env changes)

**Supabase (SQL Editor):** Run in order; safe to re-run unless noted.

1. `warehouse-pos/supabase/migrations/DELIVERY_MIGRATION.sql`
2. `warehouse-pos/supabase/migrations/ADD_DELIVERY_CANCELLED.sql`
3. `warehouse-pos/supabase/migrations/ADD_SALE_VOID.sql`
4. `warehouse-pos/supabase/migrations/FIX_VOID_SALE_SIZE_CASE.sql` (if ADD_SALE_VOID already applied)
5. `warehouse-pos/supabase/migrations/ADD_PERF_INDEXES.sql`
6. `warehouse-pos/supabase/migrations/ADD_PRODUCT_COLOR.sql` — adds optional `color` column for product size/color filters (admin + POS). **Must run before deploying** the size/color filter feature; otherwise product list API will fail on SELECT.

**API environment variables (inventory-server)** — set where the API runs (e.g. Vercel):

| Variable | Required | Notes |
|----------|----------|--------|
| `SESSION_SECRET` | Yes | Min 16 chars. Login fails with 503 if missing in production. |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key (or `SUPABASE_ANON_KEY` fallback). |
| `POS_PASSWORD_CASHIER_MAIN_STORE` | For POS | Password for `cashier@extremedeptkidz.com`. |
| `POS_PASSWORD_MAIN_TOWN` | For POS | Password for `maintown_cashier@extremedeptkidz.com`. |
| `POS_WAREHOUSE_ID_MAIN_STORE` | No | Override Main Store warehouse UUID if different from default. |
| `POS_WAREHOUSE_ID_MAIN_TOWN` | No | Override Main Town warehouse UUID if different from default. |
| `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES` | No | Override CORS defaults if needed. |

**Frontend environment variables (warehouse-pos):**

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_API_BASE_URL` | Yes (production) | Full API base URL, no trailing slash. Build fails in prod if unset. |

---

### 2.2 Deploy API first

1. **Vercel (recommended)**  
   - New Project → Import Git repo.  
   - **Root Directory:** `warehouse-pos/inventory-server`.  
   - Add all API env vars above.  
   - Deploy.  
   - Copy the deployment URL (e.g. `https://your-api.vercel.app`).

2. **CLI**  
   ```bash
   cd warehouse-pos/inventory-server
   vercel link   # if not already linked
   vercel env add SESSION_SECRET
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   # add POS_* and others as needed
   vercel --prod
   ```
   Note the production URL.

---

### 2.3 Deploy frontend

1. **Vercel**  
   - New Project (or same repo, second project) → Import repo.  
   - **Root Directory:** `warehouse-pos`.  
   - **Environment variable:** `VITE_API_BASE_URL` = API URL from 2.2 (no trailing slash).  
   - Deploy.

2. **CLI**  
   ```bash
   cd warehouse-pos
   vercel link
   vercel env add VITE_API_BASE_URL production
   vercel --prod
   ```

3. **Custom domain**  
   - In Vercel (or your host), set the frontend domain to `warehouse.extremedeptkidz.com` (or your chosen domain).  
   - Ensure API CORS allows that origin (`lib/cors.ts` already allows `https://warehouse.extremedeptkidz.com` by default).

---

### 2.4 Post-deploy checks

1. **Health**  
   `GET {API_URL}/api/health` → expect `{ "status": "ok", "db": "unavailable" or "…", "timestamp": "…" }`.

2. **Login**  
   Open frontend → Log in with admin (e.g. info@extremedeptkidz.com) or POS (cashier@… / maintown_cashier@… with env-set passwords). No 401/503.

3. **Smoke**  
   - POS: select warehouse → add product → charge → success screen → New Sale → products reload.  
   - Sales: open Sales history, confirm list loads.  
   - Inventory: open Inventory, confirm product list loads.

4. **Size & color filters (after ADD_PRODUCT_COLOR.sql)**  
   - **Inventory (admin):** Category + Size + Color chips appear; changing Size or Color refetches list; "Clear filters" resets all.  
   - **POS:** Category + Size + Color chips appear; filtering by size shows only products with stock in that size; filtering by color shows only products with that color.  
   - **API:** `GET /api/products?warehouse_id=…&size_code=US9` and `&color=Black` return filtered list; response items include `color` (string or null).

---

## Summary

| Step | Command / action | Success criterion |
|------|------------------|-------------------|
| Frontend test | `cd warehouse-pos && npm run test` | 113 tests passed |
| Frontend build | `VITE_API_BASE_URL=… npm run build` | Build completes, exit 0 |
| API build | `cd inventory-server && npm run build` (with placeholder env) | Build completes, exit 0 |
| API health (optional) | Start server, then `node scripts/health-check.mjs` | Exit 0 |
| Supabase | Run migrations in order | No SQL errors |
| Deploy API | Vercel or CLI, env set | API URL returns 200 on /api/health |
| Deploy frontend | Vercel or CLI, VITE_API_BASE_URL = API URL | App loads, login works |
| Post-deploy | Health + login + smoke | All pass |
