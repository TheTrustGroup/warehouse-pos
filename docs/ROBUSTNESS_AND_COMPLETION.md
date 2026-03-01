# Robustness, Performance & Completion — Senior Engineer Checklist

**Goal:** Wire correctly, prevent avoidable failures, optimize load time, and close gaps so the app works end-to-end with no room for failure.

---

## 1. Wiring verification

### 1.1 Auth on every protected route

- **Rule:** Every API route that requires auth must use `const auth = await requireAuth(request)` (or `requireAdmin` / `requirePosRole`) and `if (auth instanceof NextResponse) return withCors(auth, request)`.
- **Check:** Run from `inventory-server`: `npm run lint:auth`. Exit 0 = no missing `await` on auth.
- **CORS on every response:** Every route that returns a response (including 401/403) must attach CORS via `withCors(res, request)` so the browser does not block cross-origin responses. GET `/api/orders` was fixed to use `withCors` on 401 and 200.

### 1.2 Routes the frontend calls vs backend

| Frontend calls | Backend route | Status |
|----------------|---------------|--------|
| GET `/api/orders` | GET `app/api/orders/route.ts` | ✅ Auth + CORS |
| POST `/api/orders` | Not implemented | ✅ Frontend treats 404 → local order |
| PATCH `/api/orders/:id` | Not implemented | ✅ Frontend treats 404 → local update |
| PATCH `/api/orders/:id/assign-driver`, `/deliver`, `/fail` | Not implemented | ✅ 404 → local |
| PATCH `/api/orders/:id/cancel` | `app/api/orders/[id]/cancel/route.ts` | ✅ |
| POST `/api/orders/deduct` | `app/api/orders/deduct/route.ts` | ✅ **Added** — prevents 404 on “out for delivery” |
| POST `/api/orders/return-stock` | `app/api/orders/return-stock/route.ts` | ✅ |
| GET `/api/health`, `/api/warehouses`, `/api/stores`, `/api/products`, `/api/sales`, etc. | Implemented | See AUDIT_END_TO_END.md |

### 1.3 Frontend resilience (no unhandled 404s)

- **OrderContext:** `createOrder`, `updateOrderStatus`, `assignDriver`, `markAsDelivered`, `markAsFailed`, `cancelOrder` all catch 404 and apply local state + “Saved locally” toast. Deduct and return-stock now catch 404 so status update still succeeds even if one backend is missing the new route.

---

## 2. Robustness — preventing errors and failures

### 2.1 Already in place

- **API client (`apiClient.ts`):** Timeouts (default 45s), retries only for GET/HEAD/OPTIONS and for 5xx/429 on mutating methods, circuit breaker (8 failures → open, 45s cooldown), no retries on POST/PUT/PATCH/DELETE by default (avoids duplicate writes).
- **Critical data load:** Phase 1 (health + stores + warehouses) blocks UI; phase 2 (products + orders) runs in background with retry (max 3) and `withRetry`; 401 triggers session refresh and retry.
- **Error messages:** `getUserFriendlyMessage()` maps network/timeout/5xx/401/403 to user-facing copy; `isRetryableError()` used where needed.
- **Production build:** `VITE_API_BASE_URL` required (build throws if unset); no hardcoded API host in prod.
- **Auth:** Role from server only; no client-side role upgrade; known admin/cashier fallbacks only for login response parsing when server returns 200 but invalid role.

### 2.2 Recommended additions (zero-failure mindset)

1. **Input validation on API**
   - Validate all request bodies (e.g. `warehouseId` required and UUID/string format; `items` array non-empty; `productId`/`quantity` types). Return 400 with a clear message instead of 500.
   - Use a small schema lib (e.g. Zod) in `inventory-server` for POST/PATCH bodies and document expected shapes in route comments.

2. **Idempotency for critical writes**
   - POS sale and order create already support `Idempotency-Key` in `apiClient`. Ensure backend actually uses it for POST `/api/sales` and POST `/api/orders` (when implemented) so duplicate submissions (retry/refresh) do not create two sales/orders.

3. **Error boundary on frontend**
   - Add a React error boundary at app or layout level so uncaught render errors show a “Something went wrong” screen with a “Reload” button instead of a blank screen.

4. **Health check after deploy**
   - Keep calling GET `/api/health` after deploy (and in CI if possible). Document in DEPLOY_CHECKLIST.md. Consider a simple smoke: login → Dashboard → one POS sale.

5. **DB readiness**
   - Use `inventory-server/supabase/scripts/verify_warehouses_ready_for_data.sql` (or equivalent) to confirm warehouses and FK integrity before going live. Run manually or in a pre-deploy step.

6. **Logging and monitoring**
   - Log 4xx/5xx and auth failures (no PII) in the API so you can see spikes and patterns. Optionally report to an error service (e.g. from `reportError` on the client).

---

## 3. Performance and loading

### 3.1 Already in place

- **Critical data:** Phase 1 only blocks on health + stores + warehouses; phase 2 (products, orders) is non-blocking so the shell appears quickly.
- **API:** Health warmup before phase 1 reduces serverless cold start impact; 60s timeout for initial load; parallel requests in phase 1 and phase 2.
- **Build:** Recharts in `manualChunks` so Reports page loads it on demand; `sourcemap: false`; Terser minification; cache-busting assets.
- **Deploy:** `Cache-Control: no-store` for `/` and `/index.html` in `vercel.json` so the next request gets fresh HTML after deploy.

### 3.2 Recommended optimizations

1. **Product list**
   - Ensure GET `/api/products` (and admin products) use indexed queries and reasonable limits (e.g. pagination or cap at 500/1000). Already `maxDuration = 30` for products route; avoid unbounded scans.

2. **Caching headers (read-only APIs)**
   - For GET endpoints that are scope-aware and safe to cache briefly (e.g. size-codes, warehouses list), consider `Cache-Control: private, max-age=60` so repeat navigations don’t refetch every time. Keep auth and user-specific data non-cached.

3. **Prefetch / preconnect**
   - `main.tsx` already uses API preconnect where applicable; keep it so first real request reuses connection.

4. **Bundle**
   - Lazy-load heavy routes (e.g. Reports) with `React.lazy` + `Suspense` if not already; keep initial bundle minimal.

---

## 4. What’s left to make the app complete end-to-end

### 4.1 Orders (intentional gaps)

- **GET `/api/orders`:** Returns `{ data: [] }`. When orders are persisted, implement real list (scope by warehouse/user).
- **POST `/api/orders`:** Not implemented. Frontend creates local order on 404. When ready, add route and persist; align body/response with OrderContext.
- **PATCH `/api/orders/:id`** (and assign-driver, deliver, fail): Not implemented. Frontend treats 404 as local-only update. When ready, add routes and persist status/delivery info.
- **POST `/api/orders/deduct`:** Implemented; same semantics as `/api/inventory/deduct`. Frontend also tolerates 404 for backward compatibility.

### 4.2 Other

- **Migrations:** Any new `.sql` under `inventory-server/supabase/migrations/` or `supabase/migrations/` must be committed with the code that uses them (see ENGINEERING_RULES.md).
- **E2E tests:** Add at least: (1) login as cashier → open POS → load products → record sale; (2) login as admin → Dashboard → Inventory and warehouse filter. Run in CI to guard auth and critical flows.

---

## 5. Senior engineer recommendations — precise actions

1. **Before every deploy (from `warehouse-pos`):**
   - `npm run build` (frontend).
   - In `inventory-server`: `npm run lint:auth`.
   - Deploy full `dist/` and API; set `VITE_API_BASE_URL` and Supabase env; hit GET `/api/health` after deploy.

2. **To leave no room for failure:**
   - Add request body validation (e.g. Zod) on all POST/PATCH that accept JSON; return 400 with clear messages.
   - Ensure every API response (including 401/403/404/500) uses `withCors(res, request)`.
   - Keep OrderContext and CriticalDataContext tolerant of 404 and 5xx (local state + user message where appropriate).
   - Add one React error boundary at the top level and optionally report uncaught errors.

3. **Performance:**
   - Keep critical data in two phases (block only on stores/warehouses); ensure product/order fetches are bounded and indexed.
   - Lazy-load Reports (and other heavy pages) if not already.

4. **Completion:**
   - Implement POST `/api/orders` and PATCH `/api/orders/:id` (and sub-routes) when you need server-backed orders; keep frontend 404 handling until then.
   - Add minimal E2E (login → POS sale; login → Dashboard → Inventory) and run in CI.
   - Document and run DB verification script before production data load.

5. **Repo discipline:**
   - Commit and push from `warehouse-pos/` at feature boundaries; run `npm run guard:uncommitted` before leaving. Never leave migrations uncommitted.

---

## 6. Summary

- **Wiring:** Auth is awaited everywhere; GET `/api/orders` and new POST `/api/orders/deduct` have CORS; frontend handles 404 for orders and for deduct/return-stock.
- **Robustness:** Timeouts, retries, circuit breaker, friendly errors, and 404-tolerant order flow are in place; add validation, idempotency where needed, error boundary, and health/smoke checks.
- **Performance:** Two-phase critical load and build optimizations are in place; add safe caching and lazy loading where it helps.
- **Completion:** Orders backend can stay minimal until you implement full order CRUD; add E2E tests and DB verification for production readiness.
