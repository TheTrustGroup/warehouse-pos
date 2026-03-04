# Supabase + Vercel — Speed & Reliability Runbook

**Goal:** Fast product fetch, no client trust issues. Everything wired end-to-end.

---

## 1. What’s already in place

| Layer | What we do |
|-------|------------|
| **Frontend** | First product request asks for 100 items (one round-trip for most warehouses). React Query cache: 2 min stale, 10 min GC. Per-warehouse in-memory cache 60s. Circuit breaker + retries for GET. |
| **API (Vercel)** | GET /api/products: 9s request timeout, 30s maxDuration (Vercel Pro). Scope lookup cached 30s per email. Response: `Cache-Control: private, no-store`. |
| **Supabase** | Indexes on `warehouse_products(name)`, `warehouse_inventory(warehouse_id, product_id)`, `warehouse_inventory_by_size(warehouse_id, product_id)`, `user_scopes(user_email)`. DB `statement_timeout = 30s`. |
| **Health** | GET /api/health (no auth). Use `?db=1` to verify Supabase. Use for uptime checks and deploy verification. |

---

## 2. Checklist: make it fast and reliable

### Supabase (Dashboard / SQL)

- [ ] **Migrations applied**  
  Run all files in `inventory-server/supabase/migrations/` in order (SQL Editor or `supabase db push`). Critical for speed: `20260302153000_products_list_perf_indexes.sql`, `20260303120000_user_scopes_user_email_index.sql`, `20260302120000_statement_timeout_30s.sql`.

- [ ] **No “Pause project”**  
  If the project is paused, first request after resume is slow. For production, keep the project active or use a paid plan that doesn’t pause.

- [ ] **Connection**  
  The app uses the **Supabase JS client** (REST API). Use the project URL and `SUPABASE_SERVICE_ROLE_KEY` in env. No need to switch to the Postgres pooler URL for this client.

### Vercel (API project)

- [ ] **Env**  
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set in the Vercel project that runs `inventory-server`. Optional: `ALLOWED_WAREHOUSE_IDS`, `SESSION_SECRET`, POS passwords, CORS.

- [ ] **Function duration**  
  GET /api/products uses `maxDuration = 30`. On Vercel **Hobby**, max is 10s; on **Pro**, 30s is allowed. If you’re on Hobby and see timeouts, either reduce `maxDuration` to 10 in the route or upgrade.

- [ ] **Region**  
  Deploy the API in a region close to your Supabase project (e.g. same continent) to cut latency.

### Frontend (Vite app on Vercel)

- [ ] **API URL**  
  `VITE_API_BASE_URL` must point at the deployed API (e.g. `https://your-api.vercel.app`). No trailing slash.

- [ ] **CORS**  
  API’s `CORS_ORIGINS` or `FRONTEND_ORIGIN` must include the frontend origin (e.g. `https://your-app.vercel.app`).

---

## 3. Monitoring and “is it wired?”

1. **Health**  
   `GET https://<api-host>/api/health` → `{"status":"ok"}`.  
   `GET https://<api-host>/api/health?db=1` → `db: { ok: true }` when Supabase is reachable.

2. **Products (after login)**  
   Open Inventory or POS; product list should load. If it’s slow:
   - Check Vercel function logs (cold start, errors).
   - Check Supabase Dashboard → Logs for slow queries.
   - Confirm migrations are applied and indexes exist.

3. **Trust / errors**  
   - 504/503: API returns “Query timed out” and `Retry-After: 60`. Frontend retries GET (with backoff) and shows a clear message.
   - Circuit breaker: after repeated failures, frontend shows “Server temporarily unavailable” and uses cached data; no silent failure.

---

## 4. When clients report “slow” or “broken”

| Symptom | Check |
|--------|--------|
| First load very slow | Cold start (Vercel). Consider warming /api/health or /api/products with a cron or monitoring ping. |
| Products never load | CORS, 401 (auth), or wrong `VITE_API_BASE_URL`. Check browser Network tab and API logs. |
| Intermittent timeouts | Supabase `statement_timeout` or Vercel function timeout. Confirm 30s timeout in DB and, if needed, `maxDuration` on Vercel. |
| Wrong or empty list | Scope: user must have `warehouse_id` in `user_scopes` (or admin). Confirm `user_scopes` and `ALLOWED_WAREHOUSE_IDS`. |

---

## 5. Code references

| Concern | Where |
|--------|--------|
| Product list query | `inventory-server/lib/data/warehouseProducts.ts` → `getWarehouseProducts` |
| Scope cache (30s) | `inventory-server/lib/data/userScopes.ts` → `getScopeForUser` |
| Products API | `inventory-server/app/api/products/route.ts` |
| Frontend product fetch | `src/contexts/InventoryContext.tsx` → `loadProducts`, PAGE_LIMIT 100 |
| Indexes | `inventory-server/supabase/migrations/20260302153000_products_list_perf_indexes.sql`, `20260303120000_user_scopes_user_email_index.sql` |

---

*Keep this doc updated when you change timeouts, cache TTLs, or add new indexes.*
