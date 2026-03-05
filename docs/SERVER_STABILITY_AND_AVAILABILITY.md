# Server stability and avoiding "Failed to load data" / 503 / 500

This doc summarizes **what causes** dashboard/products errors and **what tools and practices** help keep the server stable and the UI resilient.

---

## Quick troubleshooting (when the app has "server issues")

1. **Local development**
   - Start the API server: from `warehouse-pos/` run `cd inventory-server && npm run dev` (runs on port 3001).
   - Point the frontend at it: create `warehouse-pos/.env.local` with `VITE_API_BASE_URL=http://localhost:3001`. Without this, dev uses the default remote URL and will fail if that server is down.
   - Health check: `cd inventory-server && BASE_URL=http://localhost:3001 npm run test:health` (hits `GET /api/health`).

2. **Production (Vercel)**
   - In Vercel → Project → Settings → Environment Variables, set **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** for the environment you use. Missing or wrong values → 500 and "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY".
   - In Vercel → Logs (or Functions), filter by "Error" to see the real server error. Redeploy after fixing env.

3. **If the UI shows "Failed to load data" or orange banner**
   - Use the **Retry** (Dashboard) or **Try again** button to reset the circuit breaker and retry after the server is fixed.
   - Check network tab: 500 = server error (often env/DB); 503 = timeout or overload; CORS/blocked = wrong `VITE_API_BASE_URL` or backend not running.

---

## When you see 500/503/504 and "Server temporarily unavailable"

1. **Check Vercel env**  
   In Vercel → Project → Settings → Environment Variables, ensure **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** are set for the environment you’re using (Production/Preview). Missing or wrong values cause 500 and "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" in server logs.

2. **Check Vercel function logs**  
   Vercel → Project → Logs (or Functions) to see the exact error (auth failure, DB timeout, missing RPC, etc.). Redeploy after fixing env so new values are applied.

3. **Circuit breaker**  
   After many 5xx or timeouts, the client stops calling the API for ~60s and shows the orange banner. Use **Try again** (or **Retry** on Dashboard) to reset and retry once the server is fixed.

4. **Client `TypeError: null is not an object (evaluating 'e.trans')`**  
   This can happen when a dependency receives a non-Error or null. The app now normalizes dashboard errors to always be `Error | null` and validates the dashboard response shape to avoid passing null where an object is expected.

---

## What you’re seeing

- **503 (Service Unavailable)**  
  The API intentionally returns 503 when a request takes too long (e.g. dashboard stats or products list exceed their time limits). That avoids the platform (e.g. Vercel) killing the request with a generic 504.

- **500 (Internal Server Error)**  
  Usually means an unhandled exception (e.g. missing env vars, DB error, or bug in server code).

- **"Failed to load data" / "Dashboard is taking too long"**  
  The UI shows this when the dashboard (or products) request fails or times out (503/500 or client timeout).

- **`e.trans` TypeError in console**  
  Often from a dependency (e.g. IndexedDB/Dexie or React Query) when it receives a `null` or unexpected value instead of an error object. Fix by using the resilient API client and by never passing `null` where an Error is expected.

- **Vercel logs: "3K errors" and slow-request warnings**  
  - **Errors (level: error)** — Filter by "Error" in Vercel Logs to see the real messages (500/503, missing env, timeouts). These are what open the circuit breaker and show the orange banner.
  - **Warnings (level: warn)** — The API logs a **warn** when a request takes **≥ 2 seconds** (see `lib/requestLog.ts` `SLOW_MS`). So a `GET /api/products` that returns **200** but takes **~4s** will appear as a warning. That’s intentional so you can spot slow endpoints. Reduce duration by adding DB indexes (see below), using a smaller `limit` for the first load (e.g. 50), and keeping the Supabase region close to your Vercel region.

---

## Tools and practices for a stable server

### 1. **Resilient API client (already in the app)**

- **Circuit breaker** (`src/lib/circuit.ts`)  
  After several failures (e.g. 503/500), the client stops sending requests for a cooldown period and shows a “degraded” state. **Use it** for all API calls that should be retried (e.g. dashboard, products GET).

- **Retries and timeouts** (`src/lib/apiClient.ts`)  
  `apiRequest` / `apiGet`:
  - Retry GETs on 5xx and timeouts (with backoff).
  - Enforce a request timeout (e.g. 45s default).
  - Record failures for the circuit breaker.

- **Use `apiGet` for dashboard and products**  
  Prefer `apiGet(API_BASE_URL, path, { timeoutMs })` instead of raw `fetch()` so dashboard and product list GETs get retries and circuit behaviour. That reduces “Failed to load data” from transient 503s.

### 2. **Server-side (Vercel + Supabase)**

- **Environment variables**  
  Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in the Vercel project. Missing env → 500 and a clear error in server logs.

- **Function duration**  
  Dashboard and products routes use `maxDuration = 30` (requires Vercel Pro for >10s). Keep heavy work under the platform limit so the function doesn’t get killed.

- **Timeouts inside the route**  
  The dashboard uses an internal timeout (~22s) and returns 503 with `Retry-After` when stats take too long. Products use a similar request/query timeout and return 503 on timeout. This gives a clear “try again” instead of a generic gateway timeout.

- **Database**  
  - Add indexes for filters used by dashboard and products (e.g. `warehouse_id`, `created_at`, category).
  - For **GET /api/products**, the code queries `warehouse_products` (ordered by `name`), then `warehouse_inventory` and `warehouse_inventory_by_size` by `warehouse_id` and `product_id`. Indexes on `warehouse_inventory(warehouse_id, product_id)` and `warehouse_inventory_by_size(warehouse_id, product_id)` (and on `warehouse_products(name)` if the list is large) will reduce response time and the number of slow-request warnings.
  - Use the `get_warehouse_inventory_stats` RPC when available so the dashboard doesn’t have to load all products; fallback is a capped product sample.
  - Consider Supabase connection pooling (e.g. Supavisor) if you hit connection limits.

- **Caching**  
  Dashboard stats are cached (e.g. Redis/Upstash) for “today” when configured. That reduces repeated heavy work and helps avoid 503 under load.

### 3. **Monitoring and observability**

- **Vercel**  
  Use Vercel dashboard → Project → Logs / Functions to see server errors, duration, and cold starts.

- **Supabase**  
  Use Dashboard → Logs and Database → Query performance to spot slow or failing queries.

- **Sentry**  
  The app uses `@sentry/react`. Ensure the backend (e.g. Next.js API routes) is also reported to Sentry so 500s and timeouts are visible and alertable.

- **Custom logging**  
  The API already logs errors (e.g. `[GET /api/dashboard]`, `[GET /api/products]`). Keep these and add request IDs in responses when needed for tracing.

### 4. **Client-side UX**

- **Retry button**  
  The dashboard “Retry” resets the circuit breaker and refetches. Keep this so users can recover after the server is back.

- **Error message**  
  Display `error?.message ?? 'Failed to load data'` (or similar) so the UI never assumes a non-null error object and avoids secondary crashes (e.g. `e.trans`).

- **Timeouts**  
  Use a client timeout slightly above the server’s (e.g. 35s for dashboard) so the user sees “timed out” instead of hanging.

---

## Quick checklist

| Area              | Action |
|------------------|--------|
| **Client**       | Use `apiGet` (or `apiRequest`) for dashboard and products GETs so retries and circuit breaker apply. |
| **Client**       | Never use `e.trans` (or similar) without checking `e != null`; prefer `error?.message` for display. |
| **Vercel**       | Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; confirm `maxDuration` and no function killed by platform. |
| **Supabase**     | Add indexes for warehouse/date/category; use RPC for dashboard stats when possible. |
| **Monitoring**   | Use Vercel logs, Supabase logs, and Sentry for 503/500 and slow requests. |
| **Caching**      | Use dashboard cache (e.g. Redis) when configured to reduce load and timeouts. |

After changes, run from `warehouse-pos/`: `npm run build` and `npm run build:server` (if you changed the server), then commit and push per `docs/ENGINEERING_RULES.md`.
