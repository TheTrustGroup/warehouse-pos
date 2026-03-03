# Inventory API 500 / 504 — Checklist

When `https://inventory-server-iota.vercel.app/api/products` or `/api/dashboard` returns **500** or **504**:

## Quick check: is the deployment live?

- **GET** `https://inventory-server-iota.vercel.app/api/health` (no auth)  
  - **200** → App is deployed and CORS works; 500/504 on products or dashboard are likely **env** (SUPABASE_*) or **DB** (schema/connection).  
  - **4xx/5xx or CORS error** → Deployment may be wrong (wrong repo, wrong root) or not updated; fix Vercel project root and redeploy.
- **GET** `https://inventory-server-iota.vercel.app/api/health?env=1`  
  - Response includes `env: { supabaseUrl: true/false, supabaseKey: true/false }`. If either is `false`, set that variable in Vercel → Project → Settings → Environment Variables and redeploy.
- **GET** `https://inventory-server-iota.vercel.app/api/health?db=1`  
  - Probes the DB (select from `warehouse_products` limit 1). Response includes `db: { ok: true }` or `db: { ok: false, error: "..." }`. If `ok: false`, the error is the root cause (e.g. relation does not exist, permission denied, timeout). Run migrations and fix grants; then products/dashboard should work.
- **To see why /api/products returns 500:** In the browser, open **Network** tab → click the failed **products** request → open **Response**. The body is JSON with an `error` field containing the exact backend reason (e.g. "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", "Failed to list products: permission denied for table warehouse_inventory", or "canceling statement due to statement timeout"). The Inventory page also shows this message under "Couldn't load products" when the request fails.
- **"Access control checks" + "network connection was lost":** Usually the connection dropped before the server sent a full response (Vercel function timeout, cold start, or Supabase statement timeout). The app now uses **cache-first first paint** (show cached products immediately), a **smaller first request** (50 items), and a **25s client timeout** so we fail fast and show cache instead of hanging. Apply the `statement_timeout` migration in Supabase; set Vercel Function Max Duration to 30s. Run `20260303120000_user_scopes_user_email_index.sql` so scope lookup is fast. It is not a CORS config bug when the response never completes.

## 504 Gateway Timeout (or "Request timed out" on the dashboard)

- **Cause:** The serverless function ran longer than Vercel’s limit (often **10s on Hobby**). The dashboard may show "Request timed out" when the client aborts, or "HTTP 504" when Vercel returns 504.
- **Do in order:**
  1. **GET** `https://inventory-server-iota.vercel.app/api/health?db=1` — if `db.ok === false`, fix DB first (migrations, grants). If `db.ok === true`, the bottleneck is function duration.
  2. **Vercel:** Project → **Settings → Functions** → **Function Max Duration** = **30** (or 60 on Hobby, 300 on Pro). Save and **redeploy**.
  3. **Supabase:** Apply `20260302120000_statement_timeout_30s.sql` and `20260302153000_products_list_perf_indexes.sql` so the product-list query finishes well under 30s.
- **Code:** `app/api/products/route.ts` and `app/api/dashboard/route.ts` already export `maxDuration = 30`. GET `/api/products` is capped at 250 items per request.

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
     The database is killing the query before it finishes. **Do:** (1) Apply `20260302120000_statement_timeout_30s.sql` in your Supabase project (sets `statement_timeout = 30s`). (2) Apply `20260302153000_products_list_perf_indexes.sql` so `warehouse_inventory`, `warehouse_inventory_by_size`, and `warehouse_products` (name, and warehouse_id when present) are indexed. (3) Use smaller pages (`limit=100` or `limit=250`); the API caps at 250 per request. When the query times out, the API returns **503** with `Retry-After: 60`.
  6. **Circuit breaker:** After repeated failures, the app opens a circuit breaker and blocks requests until cooldown. **To resume after a fix:** click **Retry** on the Dashboard, Inventory, or POS error banner to reset the circuit. Circuit config lives in `src/lib/circuit.ts` (failure threshold and cooldown); increase them if the breaker opens too easily.
  7. **Vercel / database connection:** If using Supabase (or PlanetScale/Neon), check the **Supabase Dashboard → Reports → Query Performance** (or equivalent) for slow query logs. Fix slow queries with indexes or smaller limits. In Vercel, check **Project → Logs** and **Functions** for timeouts or cold starts.
  8. **Resilience:** If only the `warehouse_inventory` (or size) query fails (e.g. timeout), the products list and dashboard now still return: product list shows with quantities as zero and dashboard stats are computed over that list. Check server logs for `[warehouseProducts] warehouse_inventory query failed:` to confirm. Fix DB/indexes so the inventory query succeeds; then quantities and stats will be correct again.

## When you have more than 50 products

The app avoids "network connection was lost" by using a **smaller first request (50 items)** and **25s client timeout** so the first paint is fast and failures fall back to cache. Additional pages load in background.

- **Inventory (context and page):** First request fetches **50 products**; if `total > 50`, the client fetches next pages (`offset=50`, `100`, …) in chunks of 50, up to **500 products** per load. Cached data is shown immediately on mount when available.
- **Inventory page UI:** "Page 1 of N" is **client-side** pagination over that loaded list (e.g. 50 items per screen page). So with 350 products loaded, you get multiple UI pages over the same 350.
- **POS:** Loads up to 250 products in one request. For more than 250 at POS, you’d add pagination or "load more" later.

## Deploy inventory-server after code changes

From the repo root (e.g. `warehouse-pos/`):

```bash
git add -A
git commit -m "fix: products API timeout and docs"
git push origin main
```

Then in Vercel, ensure the project for **inventory-server-iota.vercel.app** is connected to this repo and uses **Root Directory** `inventory-server`. Trigger a redeploy if it doesn’t run automatically.
