# Deploy — Warehouse POS

## Test status (pre-deploy)

- **Frontend:** `npm run test` → 113 tests passed. `npm run ci` (invariants + test + build) → passed.
- **API:** `npm run build` → passed. `npm run start` + `npm run test:health` → passed.
- **CI:** On push/PR to `main`, GitHub Actions runs frontend test+build and API build+health. E2E runs only if `PLAYWRIGHT_BASE_URL` is set in repo variables.

**Detailed runbook:** See **`docs/TEST_AND_DEPLOY.md`** for exact test commands, env table, and step-by-step deploy.

## Deploy steps

There is no automated deploy in this repo. Deploy manually as follows.

1. **Prerequisites**
   - **Supabase:** Run in order: `DELIVERY_MIGRATION.sql` → `ADD_DELIVERY_CANCELLED.sql` → `ADD_SALE_VOID.sql` → `FIX_VOID_SALE_SIZE_CASE.sql` (if void_sale already exists) → `ADD_PERF_INDEXES.sql`.
   - **API (inventory-server) env — required for login and DB:**
     - `SESSION_SECRET`: min 16 characters. If missing → login returns 503.
     - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
     - `SUPABASE_SERVICE_ROLE_KEY`: server-side key (or `SUPABASE_ANON_KEY` fallback).
     - **POS logins:** `POS_PASSWORD_CASHIER_MAIN_STORE`, `POS_PASSWORD_MAIN_TOWN` (see `docs/POS_LOGIN_CREDENTIALS.md`).
   - **Frontend (warehouse-pos) env:** `VITE_API_BASE_URL` = API base URL (no trailing slash).
   - **CORS:** `lib/cors.ts` allows `https://warehouse.extremedeptkidz.com` by default; override with `ALLOWED_ORIGINS` or `ALLOWED_ORIGIN_SUFFIXES` on the API if needed.

2. **Deploy API (inventory-server)**
   - Root: `warehouse-pos/inventory-server`.
   - Vercel: New Project → Import repo → set **Root Directory** to `warehouse-pos/inventory-server` → add env vars → Deploy.
   - Or CLI: `cd warehouse-pos/inventory-server && vercel --prod` (after `vercel link`).
   - Note the API URL (e.g. `https://your-api.vercel.app`).

3. **Deploy frontend (warehouse-pos)**
   - Root: `warehouse-pos` (not repo root).
   - Set `VITE_API_BASE_URL` to the API URL from step 2.
   - Vercel: New Project → Import repo → Root Directory `warehouse-pos` → env → Deploy.
   - Or CLI: `cd warehouse-pos && vercel --prod`.

4. **Post-deploy**
   - Open frontend URL; log in.
   - `GET {API_URL}/api/health` → expect `{ "status": "ok", ... }`.
   - Smoke: POS (select warehouse, add item, charge), Sales History, Deliveries (if used).

See **repo root README.md** (§ Deploy (Vercel), § Release checklist, § Test and deploy) for full detail.
