# What Else Needs to Be Done

A concise checklist so the warehouse app, API, and extremedeptkidz flow work end-to-end.

---

## 1. Environment variables (already reviewed)

- **warehouse-pos (frontend):** Only `VITE_API_BASE_URL` and `VITE_SUPER_ADMIN_EMAILS`. Remove Supabase/API secrets and `NEXT_PUBLIC_API_URL`.
- **warehouse-pos-api-v2 (API):** Add `SUPABASE_SERVICE_ROLE_KEY`; keep `CORS_ORIGINS`, `ALLOWED_ADMIN_EMAILS`, `SESSION_SECRET`, `SUPABASE_URL`, POS passwords.
- **extreme-dept-kidz:** No change for warehouse/API.

---

## 2. Point the frontend at the real API

- In **warehouse-pos** (Vercel), set **`VITE_API_BASE_URL`** to the **exact URL** of **warehouse-pos-api-v2**:
  - If the API has a custom domain (e.g. `https://api.extremedeptkidz.com`), use that.
  - Otherwise use the Vercel deployment URL (e.g. `https://warehouse-pos-api-v2-xxxx.vercel.app`).
- **Full URL with `https://`** (e.g. `https://warehouse-pos-api-v2-xxxx.vercel.app`). Without the protocol, login and API calls go to the wrong host and fail (405 / invalid credentials).
- **No trailing slash.**
- After changing, **redeploy** the warehouse-pos project so the new value is baked into the build.

---

## 3. Supabase (inventory-server database)

The API (**warehouse-pos-api-v2**) uses Supabase. Same project as in **warehouse-pos-api-v2** env (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`).

- **Migrations:** Run the SQL migrations **in order** in the Supabase SQL Editor. Full list and order: **`docs/MIGRATIONS_TO_RUN.md`**. Summary: 13 files from `20250204000000_create_warehouse_products.sql` through `20250213100000_indexes_products_category.sql` (all under `inventory-server/supabase/migrations/`).
- **Seed (optional):** To have Main Store, DC, Main town, and POS user scopes, run `inventory-server/supabase/scripts/seed_stores_warehouses_dc_maintown.sql` in the Supabase SQL Editor. Safe to run more than once.
- If migrations were already run for this project, skip; otherwise run any missing ones.

---

## 4. Redeploy after env changes

- **warehouse-pos:** Trigger a new deployment after changing or removing env vars (Vite inlines them at build time).
- **warehouse-pos-api-v2:** Trigger a new deployment after adding `SUPABASE_SERVICE_ROLE_KEY` or changing CORS/auth.

---

## 5. Test the flow

1. Open **https://warehouse.extremedeptkidz.com** (or your warehouse frontend URL).
2. **Login** with an email in `ALLOWED_ADMIN_EMAILS` (and optionally in `VITE_SUPER_ADMIN_EMAILS`). You should land on the dashboard and see “Admin Control Panel” if you’re admin.
3. **Warehouses:** No CORS/404 errors; warehouse list loads (or “Main Store” if only default). No persistent yellow “Server temporarily unavailable” banner from CORS.
4. **Inventory:** Products load (or empty state). Add/edit a product and confirm it saves.
5. **Console:** DevTools → Console. No “Origin … not allowed” or “access control” errors.

If anything fails, use the **Network** tab: check the request URL (must be `VITE_API_BASE_URL` + path) and status (401/403/404/500). See `docs/404_AND_CORS_WHICH_DOMAIN.md` and `docs/API_SETUP_WAREHOUSE_INVENTORY_EXTREMEDEPTKIDZ.md` for troubleshooting.

---

## 6. Optional: custom domain for the API

If you want a clean URL like `https://api.extremedeptkidz.com` for the API:

- In Vercel, open **warehouse-pos-api-v2** → Settings → Domains.
- Add **api.extremedeptkidz.com** (and configure DNS as Vercel instructs).
- In **warehouse-pos**, set **`VITE_API_BASE_URL=https://api.extremedeptkidz.com`** and redeploy.
- In **warehouse-pos-api-v2**, ensure **`CORS_ORIGINS`** includes `https://warehouse.extremedeptkidz.com`.

---

## Quick checklist

- [ ] Env: warehouse-pos has only `VITE_API_BASE_URL` + `VITE_SUPER_ADMIN_EMAILS`; no Supabase/secrets.
- [ ] Env: warehouse-pos-api-v2 has `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `CORS_ORIGINS`, `ALLOWED_ADMIN_EMAILS`, `SESSION_SECRET`, POS passwords.
- [ ] `VITE_API_BASE_URL` = exact base URL of warehouse-pos-api-v2 (no trailing slash).
- [ ] Supabase migrations run for the project used by the API.
- [ ] Optional: seed stores/warehouses (e.g. `seed_stores_warehouses_dc_maintown.sql`).
- [ ] Redeploy warehouse-pos and warehouse-pos-api-v2 after env changes.
- [ ] Test: login → admin dashboard, warehouses load, products load, no CORS errors in console.

Once these are done, the setup is complete for normal use.
