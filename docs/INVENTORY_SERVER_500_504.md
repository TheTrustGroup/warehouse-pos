# Inventory API 500 / 504 — Checklist

When `https://inventory-server-iota.vercel.app/api/products` or `/api/dashboard` returns **500** or **504**:

## Quick check: is the deployment live?

- **GET** `https://inventory-server-iota.vercel.app/api/health` (no auth)  
  - **200** → App is deployed and CORS works; 500/504 on products or dashboard are likely **env** (SUPABASE_*) or **DB** (schema/connection).  
  - **4xx/5xx or CORS error** → Deployment may be wrong (wrong repo, wrong root) or not updated; fix Vercel project root and redeploy.

## 504 Gateway Timeout

- **Cause:** The serverless function ran longer than Vercel’s limit (often 10s on Hobby).
- **Fix in code:** `app/api/products/route.ts` and `app/api/dashboard/route.ts` export `maxDuration = 30`. Redeploy the **inventory-server** project so this is live. GET `/api/products` list is capped at **500 items per request**; use `offset` for pagination.
- **Vercel:** Hobby allows up to 60s, Pro up to 300s. Ensure the project is redeployed after code changes.

## 500 Internal Server Error

- **Cause:** Env missing, DB error, or uncaught exception (e.g. missing table/column).
- **Checks:**
  1. **Deploy the right app**  
     The project that serves `inventory-server-iota.vercel.app` must build from this repo with **Root Directory** = `inventory-server` (or the folder that contains `app/api/products/route.ts`). Push to `main` and confirm that project’s latest deployment includes the products and dashboard routes.
  2. **Env on the inventory-server project**  
     In Vercel → Project → Settings → Environment Variables, set:
     - `SUPABASE_URL` — Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY` — service role key (or the key your app uses)
     Redeploy after changing env.
  3. **DB schema**  
     If the error message mentions a missing column or relation, run the migrations in `inventory-server/supabase/migrations/` (e.g. `size_kind`, `color`, `warehouse_products`, `warehouse_inventory`, `warehouse_inventory_by_size`, `size_codes`) in your Supabase project.
  4. **See the real error**  
     After the CORS fix, 500 responses include a JSON body and CORS headers. In Network tab, open the failing request and check **Response** for the `error` field. If the browser shows "access control checks" instead, the server returned 500 without CORS (env or uncaught throw); the products and dashboard routes now always attach CORS to 500 and validate env first.

## Deploy inventory-server after code changes

From the repo root (e.g. `warehouse-pos/`):

```bash
git add -A
git commit -m "fix: products API timeout and docs"
git push origin main
```

Then in Vercel, ensure the project for **inventory-server-iota.vercel.app** is connected to this repo and uses **Root Directory** `inventory-server`. Trigger a redeploy if it doesn’t run automatically.
