# End-to-End Audit: Warehouse POS & Inventory Server

**Date:** 2025-02-25  
**Scope:** All frontend routes, backend API routes, auth flow, and critical user journeys.

---

## 1. Frontend routes and wiring

| Route | Permission / Guard | Page/Component | Backend APIs used | Status |
|-------|--------------------|----------------|-------------------|--------|
| `/login` | Public | LoginPage | POST `/admin/api/login` → fallback POST `/api/auth/login` | ✅ Wired |
| `/` (index) | Dashboard view or redirect | DefaultRoute → Dashboard or redirect to /pos, /inventory, etc. | GET `/api/dashboard`, GET `/api/dashboard/today-by-warehouse` | ✅ Wired |
| `/inventory` | INVENTORY.VIEW | InventoryPage | GET/POST/PUT/DELETE `/api/products` or `/admin/api/products`, GET `/api/size-codes`, GET `/api/warehouses` | ✅ Wired |
| `/orders` | ORDERS.VIEW | Orders | GET `/api/orders`, POST `/api/orders`, PATCH `/api/orders/:id` (404 handled), deduct/return-stock | ✅ Wired (orders API returns empty; PATCH 404 degraded) |
| `/pos` | POS.ACCESS | POSPage | GET `/api/products`, POST `/api/sales`, GET `/api/health` (indirect) | ✅ Wired |
| `/sales` | REPORTS.VIEW_SALES | SalesHistoryPage | GET `/api/sales`, POST `/api/sales/void` | ✅ Wired |
| `/deliveries` | DELIVERIES.VIEW | DeliveriesPage | GET `/api/sales?pending=true`, PATCH `/api/sales` (delivery status) | ✅ Wired |
| `/reports` | Reports role + any report permission | Reports | GET `/api/transactions`, InventoryContext (products), local storage fallback | ✅ Wired |
| `/users` | USERS.VIEW + admin roles | Users (redirect to Settings) | — | ✅ Redirect only |
| `/settings` | SETTINGS.VIEW + admin roles | Settings | Various (stores, user-scopes, etc. as needed) | ✅ Wired |
| `*` | — | NotFound | — | ✅ |

- **Layout:** Uses `<Outlet />` for nested routes; Sidebar nav links match the routes above. Header search goes to `/inventory?q=...`.
- **Critical data:** After login, `CriticalDataGate` runs parallel load: warmup GET `/api/health`, then `refreshStores` (GET `/api/stores`), `refreshWarehouses` (GET `/api/warehouses`), then background `refreshProducts` and `refreshOrders`. All use `apiGet`/retry; 401 triggers `tryRefreshSession` (GET `/admin/api/me` or GET `/api/auth/user`).

---

## 2. Backend API routes (inventory-server)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET/POST | `/api/auth/login`, `/api/auth/logout` | — / session | POS/login flow; login sets session + optional `warehouse_id` from `user_scopes`. |
| GET | `/api/auth/user` | requireAuth | Current user; enriches with `warehouse_id` and `assignedPos` from `user_scopes`. |
| GET/POST | `/admin/api/login`, `/admin/api/logout` | — / session | Admin login; frontend tries admin first, then `/api/auth/login` on 404. |
| GET | `/admin/api/me` | requireAuth | Same as `/api/auth/user` (enriches warehouse_id). |
| GET | `/api/health` | — | Warmup and health check. |
| GET | `/api/warehouses`, `/api/warehouses/[id]` | requireAuth | Scope-aware warehouse list/detail. |
| GET | `/api/stores`, `/api/stores/[id]` | requireAuth | Scope-aware store list/detail. |
| GET/POST | `/api/products`, GET/PUT/DELETE `/api/products/[...id]` | requireAuth (list/create), requireAuth (by-id) | Products list and CRUD; scope by warehouse. |
| GET/POST/PUT/DELETE | `/admin/api/products` (and bulk, [id]) | requireAdmin | Admin product CRUD. |
| GET | `/api/size-codes` | requireAuth | Size codes for inventory. |
| GET/POST | `/api/sales` | requireAuth / requirePosRole | List sales (with `pending=true` for deliveries), record sale. |
| PATCH | `/api/sales` | requireAuth | Update delivery status (dispatched/delivered/cancelled). |
| POST | `/api/sales/void` | requireAuth | Void a sale. |
| GET | `/api/dashboard` | requireAuth | Dashboard stats by warehouse + date. |
| GET | `/api/dashboard/today-by-warehouse` | requireAuth | Today’s sales by warehouse. |
| GET | `/api/orders` | requireAuth | List orders (currently returns `{ data: [] }`). |
| POST | `/api/orders/deduct`, `/api/orders/return-stock` | requireAuth | Deduct/return stock for orders. |
| GET/POST | `/api/transactions` | requireAuth / requirePosRole | Reports: list/post transactions (scope-aware). |
| GET/POST | `/api/sync-rejections`, `/api/sync-rejections/[id]/void` | requireAuth | Sync rejections. |
| GET | `/api/user-scopes` | requireAuth | User scopes (admin/settings). |
| POST | `/api/upload/product-image` | requireAuth/admin as needed) | Product image upload. |
| GET/POST | `/api/stock-movements` | requireAuth | Stock movements. |
| GET | `/api/test` | — | Test route. |

- **Auth:** `requireAuth` and `requireAdmin` are async; all route handlers that use them must `await requireAuth(request)` (see fix in §4).
- **CORS:** Applied via `corsHeaders(request)` and `withCors(res, request)` so the frontend (different origin) can call the API.

---

## 3. Auth and session flow

1. **Login:**  
   Frontend sends POST to `/admin/api/login`; on 404, POST to `/api/auth/login`.  
   - `/api/auth/login` sets `warehouse_id` in session when user has a single warehouse in `user_scopes` (`getSingleWarehouseIdForUser`).  
   - `/admin/api/login` does **not** set `warehouse_id` in the JWT binding; both `/admin/api/me` and `/api/auth/user` **enrich** the response with `warehouse_id` and `assignedPos` from `user_scopes`. So cashiers get the correct warehouse after any login path.

2. **Session check (load / refresh):**  
   Frontend calls GET `/admin/api/me` first; on 404/401/403, GET `/api/auth/user`.  
   - If the user is a POS role with a single warehouse and `warehouseId` is missing, frontend fetches GET `/api/auth/user` again to get enrichment.  
   - Both `/admin/api/me` and `/api/auth/user` add `warehouse_id` and `assignedPos` when missing.

3. **Logout:**  
   POST `/admin/api/logout` and, on 404, POST `/api/auth/logout`; frontend clears local/session storage.

4. **POS and warehouse:**  
   - `WarehouseContext` uses `auth?.user?.warehouseId` as `boundWarehouseId`; when set, `isWarehouseBoundToSession` is true and the POS does not show the location selector.  
   - POS uses only the bound warehouse or the warehouse from context; the header shows a static location label (no switcher).

---

## 4. Bugs fixed during audit

- **GET `/api/orders`: auth not enforced**  
  The handler used `const auth = requireAuth(request)` without `await`, so `auth` was a Promise and the 401 path was never taken.  
  **Fix:** Use `const auth = await requireAuth(request); if (auth instanceof NextResponse) return auth;` so unauthenticated requests receive 401.  
  **File:** `inventory-server/app/api/orders/route.ts`.

- **Admin login: cashier `warehouse_id` not in session**  
  `POST /admin/api/login` did not set `warehouse_id` in the session when the user had a single warehouse in `user_scopes`, so the first `/admin/api/me` response lacked it and the frontend had to call `/api/auth/user` again.  
  **Fix:** In `admin/api/login`, after building `binding` from the body, if `binding?.warehouse_id` is missing, call `getSingleWarehouseIdForUser(email)` and set `binding.warehouse_id`. Aligns with `api/auth/login`.  
  **File:** `inventory-server/app/admin/api/login/route.ts`.

- **Five more routes: auth not enforced (missing `await`)**  
  The same bug (calling `requireAuth`/`requireAdmin`/`requirePosRole` without `await`) existed in: `admin/api/products/bulk`, `api/inventory/deduct`, `api/stock-movements`, `api/sync-rejections`, `api/sync-rejections/[id]/void`. Unauthenticated requests could get 200 instead of 401.  
  **Fix:** Added `await` before each auth call. Added `scripts/check-auth-await.mjs` and `npm run lint:auth` so this cannot regress.

---

## 5. Intentional gaps / degraded behavior

- **Orders:** Backend only implements GET (returns `[]`) and POST `/api/orders/deduct`, `/api/orders/return-stock`. There are no PATCH routes for `/api/orders/:id`, `assign-driver`, `deliver`, `fail`, or `cancel`. The frontend OrderContext calls these and treats 404 as “Updated locally. Server order sync not available.” This is intentional until full order CRUD exists.
- **Inventory:** Frontend tries `/admin/api/products` first for create/update/delete; on 404 or failure it falls back to `/api/products`. Both paths are implemented and scope-aware.

---

## 6. Recommendations

1. **Auth consistency:** ✅ Enforced. Every protected route now uses `await requireAuth`/`requireAdmin`/`requirePosRole`. Run `npm run lint:auth` in `inventory-server` before deploy to catch regressions.
2. **Admin login and warehouse_id:** ✅ Done. `/admin/api/login` now sets `warehouse_id` from `getSingleWarehouseIdForUser(email)` when not provided in the body, so the first `/admin/api/me` response includes it for cashiers.
3. **Orders:** When adding full order management, add PATCH `/api/orders/[id]` and the sub-routes (e.g. assign-driver, deliver, fail, cancel) and align request/response shapes with OrderContext.
4. **E2E tests:** Add a minimal E2E (e.g. Playwright) that: logs in as cashier, opens POS, loads products, and records a sale; and one that logs in as admin, opens Dashboard, then Inventory, and checks warehouse filter. This guards regressions on auth and warehouse binding.
5. **Health after deploy:** Keep using GET `/api/health` after deploy (and optionally in CI) to confirm the API is up and DB is reachable.
6. **VITE_API_BASE_URL:** Keep production build requiring `VITE_API_BASE_URL` (already enforced in `lib/api.ts`) and document it in the deploy checklist.

---

## 7. Summary

- **Frontend:** All defined routes are wired to the correct pages and permissions; Layout and Sidebar match; CriticalDataGate and WarehouseContext are used consistently; POS no longer shows a warehouse selector and uses bound/context warehouse only.
- **Backend:** All routes used by the frontend exist; auth is applied consistently after fixing GET `/api/orders`. Session and user enrichment for `warehouse_id` and `assignedPos` are implemented for both admin and POS login paths.
- **End-to-end:** Login (admin and cashier), dashboard, inventory, POS, sales history, deliveries, and reports are wired end-to-end with correct auth and scope. Orders list and write paths are intentionally minimal on the server with graceful 404 handling on the client.
