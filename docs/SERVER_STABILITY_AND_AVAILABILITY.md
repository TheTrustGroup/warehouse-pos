# Server stability and avoiding "Failed to load data" / 503 / 500

This doc summarizes **what causes** dashboard/products errors and **what tools and practices** help keep the server stable and the UI resilient.

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
