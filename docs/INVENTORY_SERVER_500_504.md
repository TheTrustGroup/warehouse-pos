# Inventory API 500 / 504 — Checklist

When `https://inventory-server-iota.vercel.app/api/products` or `/api/dashboard` returns **500** or **504**:

## Quick check: is the deployment live?

- **GET** `https://inventory-server-iota.vercel.app/api/health` (no auth)  
  - **200** → App is deployed and CORS works; 500/504 on products or dashboard are likely **env** (SUPABASE_*) or **DB** (schema/connection).  
  - **4xx/5xx or CORS error** → Deployment may be wrong (wrong repo, wrong root) or not updated; fix Vercel project root and redeploy.
- **GET** `https://inventory-server-iota.vercel.app/api/health?env=1`  
  - Response includes `env: { supabaseUrl: true/false, supabaseKey: true/false }`. If either is `false`, set that variable in Vercel → Project → Settings → Environment Variables and redeploy.
- **To see why /api/products returns 500:** In the browser, open **Network** tab → click the failed **products** request → open **Response**. The body is JSON with an `error` field containing the exact backend reason (e.g. "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", "Failed to list products: permission denied for table warehouse_inventory", or "canceling statement due to statement timeout"). The Inventory page also shows this message under "Couldn't load products" when the request fails.
- **"Access control checks" + "network connection was lost":** Usually the connection dropped before the server sent a full response (Vercel function timeout, cold start, or Supabase statement timeout). Apply the `statement_timeout` migration in Supabase; set Vercel Function Max Duration to 30s; retry. It is not a CORS config bug when the response never completes.

## 504 Gateway Timeout

- **Cause:** The serverless function ran longer than Vercel’s limit (often 10s on Hobby).
- **Fix in code:** `app/api/products/route.ts` and `app/api/dashboard/route.ts` export `maxDuration = 30`. GET `/api/products` list is capped at **250 items per request**; use `offset` for pagination.
- **Vercel:** In Project → **Settings → Functions**, set **Function Max Duration** to 30 (or 60 on Hobby, 300 on Pro). Redeploy after code or setting changes.

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
  5. **"canceling statement" or "canceling statement due to statement timeout"**  
     The database is killing the query before it finishes. **Do both:** (1) Apply the migration `20260302120000_statement_timeout_30s.sql` in your Supabase project (Dashboard → SQL Editor, or `supabase db push`). It sets `statement_timeout = 30s` for the database so the product-list query can complete. (2) Ensure the app requests smaller pages (e.g. `limit=100` or `limit=250`); the API and data layer cap at 250 per request — use pagination for more.
  6. **Resilience:** If only the `warehouse_inventory` (or size) query fails (e.g. timeout), the products list and dashboard now still return: product list shows with quantities as zero and dashboard stats are computed over that list. Check server logs for `[warehouseProducts] warehouse_inventory query failed:` to confirm. Fix DB/indexes so the inventory query succeeds; then quantities and stats will be correct again.

## When you have more than 100 products

The app avoids timeouts by requesting **100 products per API call** (Inventory) or **250** (POS). When there are more than 100 products:

- **Inventory (context and page):** The first request returns `{ data, total }`. If `total > 100`, the client automatically fetches the next pages (`offset=100`, `200`, …) in chunks of 100 and merges them, up to **500 products** per load. So you see the full list without one huge request.
- **Inventory page UI:** "Page 1 of N" is **client-side** pagination over that loaded list (e.g. 20 items per screen page). So with 350 products loaded, you get multiple UI pages over the same 350.
- **POS:** Loads up to 250 products in one request. For more than 250 at POS, you’d add pagination or "load more" later.

## Deploy inventory-server after code changes

From the repo root (e.g. `warehouse-pos/`):

```bash
git add -A
git commit -m "fix: products API timeout and docs"
git push origin main
```

Then in Vercel, ensure the project for **inventory-server-iota.vercel.app** is connected to this repo and uses **Root Directory** `inventory-server`. Trigger a redeploy if it doesn’t run automatically.
