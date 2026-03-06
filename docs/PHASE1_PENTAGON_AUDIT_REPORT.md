# Phase 1 — Pentagon-Grade Technical Audit Report

**Codebase:** warehouse-pos (Vite + React frontend, Next.js API routes backend, Supabase, Vercel)  
**Deployments:** warehouse.extremedeptkidz.com, warehouse.hunnidofficial.com  
**Audit date:** 2025-03-05  
**Scope:** All 18 audit domains; no code changes (Phase 2 pending approval).

---

## EXECUTIVE SUMMARY

| Metric | Count |
|--------|--------|
| **Total issues found** | 24 |
| **P0 (Show stoppers)** | 2 |
| **P1 (High priority)** | 5 |
| **P2 (Medium priority)** | 10 |
| **P3 (Low / Enhancement)** | 7 |

**Database diagnostic results:**  
The 14 diagnostic queries were **not executed** (no direct DB access in this audit). The SQL is provided in the DATABASE FINDINGS section. Run them in Supabase SQL Editor for both projects (EDK and Hunnid) and fix any query that returns non-zero rows where zero is expected.

**Top 5 most critical issues**

1. **P0 — Reports API missing:** Frontend calls `GET /api/reports/sales` and `GET /api/transactions`; neither route exists in inventory-server. Reports page falls back to local/JS data; server-backed revenue/COGS/profit are never used.  
2. **P0 — POS Charge button allows double-tap:** `charging` is cleared in `onMutate` (optimistic) instead of in `onSuccess`/`onError`, so the button re-enables before the POST completes. Risk of duplicate charges.  
3. **P1 — No logout API:** Frontend calls `/admin/api/logout` and `/api/auth/logout`; inventory-server has no logout route. Session/cookie not invalidated server-side.  
4. **P1 — salesApi expects wrong GET /api/sales shape:** `fetchSalesFromApi` expects `{ data, total }`; API returns a **bare array**. Code is currently unused; if ever used (e.g. Reports), it would get empty data.  
5. **P1 — Payment method display mismatch:** API returns `cash` / `card` / `mobile_money` / `mixed`; Sales History UI expects `Cash` / `MoMo` / `Card`. `mobile_money` and `mixed` show raw value in badge.

**Estimated total fix time:** 3–5 days  
**Estimated time to fix P0 + P1 only:** 8–14 hours  

**Overall system health score:** **6.5/10**  
**Reasoning:** Core flows (login, products CRUD, POS sale, sales history, dashboard, void, clear-sales) are implemented and wired. Gaps: missing Reports/Transactions APIs, POS double-tap risk, no server logout, and dependency/contract/UX issues that should be fixed before treating the system as production-hardened.

---

## P0 — SHOW STOPPERS

### 1. Reports and Transactions APIs do not exist

- **Domain:** 1 (Frontend ↔ Backend contract), 9 (Reports and financial accuracy)
- **File(s):**  
  - `src/services/reportsApi.ts` (calls `GET /api/reports/sales`)  
  - `src/services/transactionsApi.ts` (calls `GET /api/transactions`)  
  - `src/pages/Reports.tsx` (uses both)
- **What's broken:** Reports page tries to load server-backed sales report and transactions. Only 9 API routes exist under `inventory-server/app/api/`; there are **no** `api/reports/sales` or `api/transactions` routes. Requests 404; page falls back to local data only.
- **How to reproduce:** Log in, go to Reports, pick a date range. Observe network: 404 for `/api/reports/sales` and `/api/transactions`. "Sales report from API" never populates; only JS-generated report from local transactions is used.
- **Impact:** Revenue/COGS/profit from server (sales + sale_lines) are never shown. Reports are only as good as local storage; multi-device and historical accuracy are wrong.
- **Root cause:** Backend was never given these routes; frontend was built expecting them.
- **Fix:** Implement `GET /api/reports/sales` (e.g. using `get_sales_report` RPC if present) and `GET /api/transactions` (or equivalent) in inventory-server, aligned with existing auth and warehouse scoping. Alternatively, have Reports use `GET /api/sales` with date filters and compute metrics client-side until backend reports exist.
- **Confidence:** High  
- **Effort:** M (backend + contract alignment)

---

### 2. POS Charge button can be double-tapped (duplicate sale risk)

- **Domain:** 2 (Every button and action), 6 (POS flow)
- **File(s):** `src/pages/POSPage.tsx` (e.g. lines 537–538, 401–410, 531–533)
- **What's broken:** `handleCharge` sets `charging` true then calls `saleMutation.mutate()`. `onMutate` runs immediately and sets `setCharging(false)`. So the Charge button is only disabled for a brief moment; user can tap again while the first POST is in flight.
- **How to reproduce:** Add items, tap Charge. As soon as the button re-enables (or before), tap Charge again. Two POSTs can be sent; two sales can be recorded.
- **Impact:** Duplicate sales, double deduction of stock, customer charged twice.
- **Root cause:** Loading state is cleared in the optimistic `onMutate` instead of when the mutation settles.
- **Fix:** Do **not** set `setCharging(false)` in `onMutate`. Set `setCharging(false)` in `onSuccess`, `onError`, and in the offline path after completion. Keep the button disabled (and optionally show spinner) until the request finishes or fails.
- **Confidence:** High  
- **Effort:** XS

---

## P1 — HIGH PRIORITY

### 3. No server-side logout route

- **Domain:** 5 (Authentication and session)
- **File(s):** `src/contexts/AuthContext.tsx` (logout and inactivity flow call `/admin/api/logout` and `/api/auth/logout`); inventory-server has no `api/auth/logout` or `admin/api/*` routes.
- **What's broken:** Logout and inactivity timeout call endpoints that 404. Client clears localStorage/sessionStorage and user state, but server session/cookie is not invalidated.
- **Impact:** If auth is cookie-based, the same cookie could still authorize requests until it expires. Token in localStorage is removed, but any httpOnly session cookie would remain valid.
- **Root cause:** Logout routes were never implemented in inventory-server.
- **Fix:** Add `POST /api/auth/logout` (and optionally `admin/api/logout`) that clear session / invalidate cookie and return 200. Call it from AuthContext before clearing client state. If using only Bearer in localStorage, document that and consider still adding logout for consistency and future cookie use.
- **Confidence:** High  
- **Effort:** S

---

### 4. salesApi expects wrong response shape for GET /api/sales

- **Domain:** 1 (Frontend ↔ Backend contract)
- **File(s):** `src/services/salesApi.ts` (lines 96–99)
- **What's broken:** `fetchSalesFromApi` does `const data = Array.isArray(res?.data) ? res.data : [];`. GET /api/sales returns the list **at the root** (`NextResponse.json(list)`), not `{ data, total }`. So `res` is the array, `res?.data` is undefined, and `data` is always `[]`.
- **How to reproduce:** Any code that calls `fetchSalesFromApi` would get empty `data`. Currently **no caller** exists in the repo (grep confirmed). So this is a latent bug if Reports or another feature is later wired to this function.
- **Impact:** If `fetchSalesFromApi` or `fetchSalesAsTransactions` is used, sales list and reports would be empty.
- **Root cause:** API returns array; client assumed wrapped shape.
- **Fix:** In `fetchSalesFromApi`, handle both shapes:  
  `const data = Array.isArray(res) ? res : (res?.data ?? []);`  
  `const total = typeof (res as any)?.total === 'number' ? (res as any).total : data.length;`  
  Prefer a small shared type/helper for GET /api/sales response so both SalesHistoryPage and salesApi stay in sync.
- **Confidence:** High  
- **Effort:** XS

---

### 5. Payment method display in Sales History

- **Domain:** 2 (Every button and action), 6 (POS flow)
- **File(s):** `src/pages/SalesHistoryPage.tsx` (PayBadge, PAY_COLORS keyed by `Cash` / `MoMo` / `Card`); API returns `payment_method` as `cash` | `card` | `mobile_money` | `mixed`.
- **What's broken:** Badge uses `sale.paymentMethod` as key. For `mobile_money` or `mixed`, there is no matching key, so fallback style is used and the raw string is shown (e.g. "mobile_money").
- **How to reproduce:** Create a sale with Mobile Money or Mixed payment. Open Sales History; badge shows "mobile_money" or "mixed" instead of "MoMo" / "Mixed".
- **Impact:** Inconsistent UX and possible confusion for staff.
- **Root cause:** Display mapping was not aligned with API values.
- **Fix:** Normalize before display: map `mobile_money` → "MoMo", `mixed` → "Mixed", `cash` → "Cash", `card` → "Card"; use a single display string for badge and CSV export.
- **Confidence:** High  
- **Effort:** XS

---

### 6. GET /api/sales does not support `to` parameter

- **Domain:** 1 (Frontend ↔ Backend contract)
- **File(s):** `inventory-server/app/api/sales/route.ts` (GET reads `from`, `warehouse_id`, `pending`, `limit` only); `src/services/salesApi.ts` sends `from` and `to`.
- **What's broken:** Backend ignores `to`. Sales list is filtered only by `from` (>=) and limit. Date range "to" is not applied.
- **Impact:** If any code used `fetchSalesFromApi` with a range, end date would be ignored; more rows than intended could be returned. Currently unused; same fix as in finding 4 would apply when aligning contract.
- **Fix:** Either add `to` to GET /api/sales and filter `created_at <= to`, or document that only `from` + `limit` apply and remove `to` from frontend params.
- **Confidence:** High  
- **Effort:** S (if backend filter added) or XS (doc + frontend cleanup)

---

### 7. Dashboard today-by-warehouse fetch does not use apiClient

- **Domain:** 1 (Frontend ↔ Backend contract), 11 (Error handling)
- **File(s):** `src/hooks/useDashboardQuery.ts` (lines 61–78): `fetchTodayByWarehouse` uses raw `fetch` with manual timeout and no retries/circuit breaker.
- **What's broken:** Other dashboard and API calls use `apiGet` (retries, circuit breaker, timeout). This path does not; on failure it returns `{}` with no user feedback.
- **Impact:** Transient failures or timeouts give no retry and no clear error; "today by warehouse" can silently be empty.
- **Fix:** Use `apiGet` (or same pattern as main dashboard fetch) for `/api/dashboard/today-by-warehouse`, with appropriate timeout and error propagation so UI can show error or retry.
- **Confidence:** Medium  
- **Effort:** XS

---

## P2 — MEDIUM PRIORITY

### 8. Deliveries and Sales History use raw fetch without shared client

- **Domain:** 1, 11
- **File(s):** `src/pages/DeliveriesPage.tsx` (fetch for GET and PATCH /api/sales), `src/pages/SalesHistoryPage.tsx` (void and clear-sales use fetch; list uses apiGet).
- **What's broken:** No retries, no circuit breaker, no centralized timeout. Void and clear-sales could fail silently on network blips.
- **Impact:** Slightly worse resilience than routes using apiClient; errors may be less clear.
- **Fix:** Use apiClient (apiGet / apiPost) for these calls where appropriate, or add a thin wrapper that applies timeout and error handling.
- **Confidence:** Medium  
- **Effort:** S

---

### 9. Session expiry during charge not specifically handled

- **Domain:** 5 (Authentication), 6 (POS)
- **What's broken:** If 401 is returned during POST /api/sales, apiClient calls `onUnauthorized()` and AuthContext clears user. POS mutation onError handles 401 with "Session expired. Please log in again." Cart is restored by onError. No explicit "session expired mid-sale" flow (e.g. save cart for after re-login).
- **Impact:** User can recover by re-login and re-adding items; no data loss, but flow could be smoother.
- **Fix:** Consider storing pending cart in sessionStorage on 401 during charge and offering "Restore cart" after login. Optional enhancement.
- **Confidence:** Low  
- **Effort:** S

---

### 10. Auth tries /admin/api/me first; inventory-server has no admin routes

- **Domain:** 1, 5
- **File(s):** `src/contexts/AuthContext.tsx` (checkAuthStatus, tryRefreshSession): first request to `/admin/api/me`, then fallback to `/api/auth/user` on 404/403.
- **What's broken:** inventory-server only has `/api/auth/user`. First request always 404s; then second succeeds. Extra round-trip and log noise.
- **Impact:** Slightly slower session check and unnecessary 404 in network tab.
- **Fix:** If this codebase only talks to inventory-server, call `/api/auth/user` only. Or add a simple `/admin/api/me` that mirrors auth/user so both deployments behave the same.
- **Confidence:** High  
- **Effort:** XS

---

### 11. Production build keeps console (terser drop_console: false)

- **Domain:** 12 (Performance), 17 (Code quality), 18 (Deployment)
- **File(s):** `vite.config.ts` (terserOptions.compress.drop_console: false).
- **What's broken:** Console statements are not stripped in production build.
- **Impact:** Slightly larger bundle and possible leakage of debug info in browser console.
- **Fix:** Set `drop_console: true` for production, or use an env guard so only non-production builds keep console.
- **Confidence:** High  
- **Effort:** XS

---

### 12. SalesHistoryPage warehouse list is hardcoded

- **Domain:** 16 (Edge cases), 15 (Users and permissions)
- **File(s):** `src/pages/SalesHistoryPage.tsx` (WAREHOUSES constant with two UUIDs).
- **What's broken:** Warehouses are not loaded from API; they are fixed. If a client has different or more warehouses, list is wrong.
- **Impact:** Wrong or missing warehouse filter for some deployments.
- **Fix:** Load warehouses from GET /api/warehouses (if added) or from existing warehouse context/API and use that for the dropdown.
- **Confidence:** High  
- **Effort:** S (depends on availability of warehouses API)

---

### 13. No rate limiting on login or mutations

- **Domain:** 14 (Security)
- **File(s):** inventory-server API routes (no rate limit middleware).
- **What's broken:** Login and other endpoints are not rate-limited. Brute force and abuse are easier.
- **Impact:** Credential stuffing and DoS risk.
- **Fix:** Add rate limiting (e.g. Vercel or Upstash) for POST /api/auth/login and optionally for POST /api/sales and other mutations.
- **Confidence:** High  
- **Effort:** M

---

### 14. npm audit: high/critical vulnerabilities

- **Domain:** 14 (Security), 18 (Deployment)
- **What's broken:** `npm audit` reports high severity (e.g. @typescript-eslint/*, minimatch ReDoS; @vitejs/plugin-legacy, vitest/vite/esbuild moderate). Some have fixes available.
- **Impact:** Dev/build-time and possibly production exposure depending on usage (e.g. minimatch in tooling).
- **Fix:** Run `npm audit fix` and address remaining items; upgrade major versions where needed and re-test.
- **Confidence:** High  
- **Effort:** S–M

---

### 15. Inactivity logout calls non-existent logout endpoints

- **Domain:** 5
- **File(s):** `src/contexts/AuthContext.tsx` (inactivity interval): calls `/admin/api/logout` and `/api/auth/logout`; both 404.
- **What's broken:** Same as finding 3: server session not invalidated on timeout.
- **Fix:** Same as finding 3; single logout route used from both logout and inactivity.
- **Confidence:** High  
- **Effort:** Covered by fix for 3

---

### 16. Error response shape inconsistency

- **Domain:** 1, 11
- **What's broken:** Some APIs return `{ error: string }`, others `{ message: string }` or both. Frontend sometimes checks `error` and sometimes `message`. Not wrong but inconsistent.
- **Fix:** Standardize API error shape (e.g. `{ error: string, code?: string }`) and one reader on the client.
- **Confidence:** Medium  
- **Effort:** S

---

### 17. No explicit handling for 429 (rate limit) in apiClient

- **Domain:** 11
- **File(s):** `src/lib/apiClient.ts`: RETRYABLE_STATUSES includes 429; no special message for "rate limited" in UI.
- **What's broken:** After retries, user sees generic failure; they don't know they were rate limited.
- **Fix:** Detect 429 in error and show a specific message (e.g. "Too many requests; please wait a moment").
- **Confidence:** Low  
- **Effort:** XS

---

## P3 — ENHANCEMENTS

### 18. VITE_API_BASE_URL required in production but not validated at runtime for empty string

- **Domain:** 18
- **File(s):** `src/lib/api.ts`: In production, empty string is valid (same-origin). If env is set to a space or invalid value, resolution could be surprising.
- **Fix:** Normalize and validate; consider a runtime check on first API call and surface a clear error if base URL is invalid.
- **Confidence:** Low  
- **Effort:** XS

---

### 19. POS product cache TTL (30s) and inventory refresh

- **Domain:** 3 (Data flow), 10 (Real-time sync)
- **What's broken:** POS caches products 30s. If another device sells the last unit, POS can show stale stock until cache expires or user does "New sale".
- **Fix:** Document behavior; optionally shorten TTL or invalidate on focus/visibility for POS.
- **Confidence:** Medium  
- **Effort:** S

---

### 20. Reports fallback to local transactions when API 404s

- **Domain:** 9, 11
- **What's broken:** When /api/reports/sales and /api/transactions 404, Reports silently use local data. User may not know data is not server-backed.
- **Fix:** When API is used and returns 404/5xx, show a banner: "Report is from local data; server report unavailable."
- **Confidence:** High  
- **Effort:** XS

---

### 21. Large component files

- **Domain:** 17
- **File(s):** e.g. `InventoryContext.tsx` (~1350 lines), `AuthContext.tsx` (~500), `POSPage.tsx` (~900).
- **What's broken:** Harder to maintain and test; mixed concerns.
- **Fix:** Split into smaller modules/hooks (e.g. inventory load vs. mutate, auth checks vs. login/logout).
- **Confidence:** Medium  
- **Effort:** L

---

### 22. No E2E coverage for critical POS flow in CI

- **Domain:** 18
- **What's broken:** e2e/pos-sale.spec.ts exists; not confirmed if run in CI on every commit. Critical path should be guarded.
- **Fix:** Ensure Playwright (or equivalent) runs in CI and that POS sale flow is included.
- **Confidence:** Low  
- **Effort:** S

---

### 23. Health endpoint returns minimal info

- **Domain:** 14, 18
- **What's broken:** GET /api/health returns `{ status: 'ok' }`. No version, no dependency checks (DB, Redis). Acceptable for liveness; less useful for readiness.
- **Fix:** Optional: add a readiness path that checks DB (and cache if used) and returns 503 if unhealthy.
- **Confidence:** Low  
- **Effort:** S

---

### 24. Delivery list uses sales with delivery_status; schema dependency

- **Domain:** 4, 8
- **What's broken:** Deliveries page uses GET /api/sales?pending=true and maps results to "deliveries". If sales table lacks delivery_status/delivery columns, API falls back to base columns. Migrations show delivery columns exist; no bug found, but coupling is high.
- **Fix:** Document that "deliveries" are sales with delivery info; consider a dedicated GET /api/deliveries if the model diverges.
- **Confidence:** Low  
- **Effort:** M (only if adding dedicated API)

---

## DATABASE FINDINGS

The following SQL should be run in **Supabase SQL Editor** for **both** projects (EDK and Hunnid). Adjust table/column names if your schema differs (e.g. from migrations: `warehouse_products`, `warehouse_inventory_by_size`, `sales`, `sale_lines`, `warehouse_inventory`).

**1. Tables without primary keys**

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT DISTINCT table_name
  FROM information_schema.table_constraints
  WHERE constraint_type = 'PRIMARY KEY'
  AND table_schema = 'public'
);
```

**2. Foreign keys without indexes**

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_schema = 'public'
AND NOT EXISTS (
  SELECT 1 FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename = tc.table_name
  AND indexdef LIKE '%' || kcu.column_name || '%'
);
```

**3. Columns that allow NULL but may need NOT NULL (business rule)**

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND is_nullable = 'YES'
AND column_name IN (
  'warehouse_id', 'product_id', 'quantity',
  'price', 'cost_price', 'payment_method',
  'created_at', 'status', 'sale_id'
)
ORDER BY table_name, column_name;
```

**4. Orphaned inventory records (inventory pointing to missing product)**

```sql
-- Adjust if your table is warehouse_inventory with product_id
SELECT COUNT(*) AS orphaned_inventory
FROM warehouse_inventory wi
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_products wp
  WHERE wp.id = wi.product_id
);
```

**5. Negative stock**

```sql
SELECT product_id, warehouse_id, quantity
FROM warehouse_inventory_by_size
WHERE quantity < 0;
```

**6. Stock drift (stored total vs sum of sizes)**

```sql
SELECT
  wp.id,
  wp.name,
  wp.total_quantity AS stored,
  COALESCE(SUM(wis.quantity), 0) AS actual,
  wp.total_quantity - COALESCE(SUM(wis.quantity), 0) AS drift
FROM warehouse_products wp
LEFT JOIN warehouse_inventory_by_size wis ON wis.product_id = wp.id
GROUP BY wp.id, wp.name, wp.total_quantity
HAVING wp.total_quantity != COALESCE(SUM(wis.quantity), 0)
ORDER BY ABS(wp.total_quantity - COALESCE(SUM(wis.quantity), 0)) DESC;
```

**7. Sales with no line items**

```sql
SELECT s.id, s.created_at, s.total
FROM sales s
WHERE NOT EXISTS (
  SELECT 1 FROM sale_lines sl
  WHERE sl.sale_id = s.id
);
```

**8. Sale lines with no parent sale**

```sql
SELECT sl.id, sl.sale_id, sl.product_id
FROM sale_lines sl
WHERE NOT EXISTS (
  SELECT 1 FROM sales s
  WHERE s.id = sl.sale_id
);
```

**9. Products with no inventory record**

```sql
-- Adjust if you use warehouse_inventory as the main inventory table
SELECT wp.id, wp.name, wp.created_at
FROM warehouse_products wp
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_inventory wi
  WHERE wi.product_id = wp.id
);
```

**10. Duplicate SKUs within same warehouse**

```sql
SELECT sku, warehouse_id, COUNT(*) AS count
FROM warehouse_products
GROUP BY sku, warehouse_id
HAVING COUNT(*) > 1;
```

**11. RLS policies**

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**12. RLS enabled per table**

```sql
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**13. record_sale function signature**

```sql
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'record_sale'
AND pronamespace = 'public'::regnamespace;
```

**14. Check constraints**

```sql
SELECT tc.table_name, tc.constraint_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name;
```

**Action:** Run each query. For 1, 4, 5, 6, 7, 8, 9, 10: **zero rows** is desired. Any non-zero result indicates a data integrity or schema issue to fix. For 2: add indexes on FK columns where missing. For 3, 11, 12, 13, 14: review for policy and constraint correctness.

---

## WHAT IS WORKING WELL

- **Auth flow:** Login (POST /api/auth/login), session (GET /api/auth/user), and role resolution work. Protected routes and permission checks are in place. Session stored in localStorage and optional cookie; 401 triggers redirect to login.
- **Products CRUD:** GET/POST/PUT/DELETE /api/products are implemented with warehouse scoping, timeouts, and cache invalidation. Frontend InventoryContext uses apiClient, handles both `{ data, total }` and array response via parseProductsResponse, and supports pagination and silent refresh.
- **POS sale flow:** POST /api/sales calls record_sale RPC; payment method is normalized to allowed values (cash, card, mobile_money, mixed); mixed payment is validated. Stock deduction and receipt_id are handled in DB. Frontend sends correct payload; optimistic update and rollback on error are implemented (only loading state is wrong per P0#2).
- **Sales history:** GET /api/sales returns list; SalesHistoryPage correctly handles array response. Void (POST /api/sales/void) and clear-sales (POST /api/admin/clear-sales-history) are implemented and used with correct payloads.
- **Dashboard:** GET /api/dashboard and GET /api/dashboard/today-by-warehouse exist; dashboard stats (including low stock) and warehouse-scoping are implemented. Frontend useDashboardQuery uses apiGet for main stats with retries and circuit breaker.
- **Deliveries:** Deliveries are implemented as sales with delivery fields. GET /api/sales?pending=true and PATCH /api/sales for delivery status work; DeliveriesPage handles both array and wrapped response.
- **API resilience:** apiClient provides timeouts, retries for GET, no retries for mutations, circuit breaker, and 401 handling. CORS and auth headers are consistent.
- **Payment method constraint:** sales_payment_method_check migration restricts payment_method to cash, card, mobile_money, mixed (case-insensitive); avoids invalid DB inserts.
- **Void and stock restore:** void_sale RPC and restore_stock migrations are in place; clear_sales_history RPC is implemented and used by admin clear-sales.
- **Code quality:** No TODO/FIXME/@ts-ignore in src; TypeScript and Zod are used for API and auth shapes. Single source of truth for API base URL (lib/api.ts).

---

**End of Phase 1 report. No code has been changed. Await approval before Phase 2 (fixes).**
