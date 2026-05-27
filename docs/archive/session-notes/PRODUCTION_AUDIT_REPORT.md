# Production End-to-End Audit Report  
**System:** Warehouse + POS + Inventory  
**Deployment:** https://warehouse.extremedeptkidz.com  
**Audit date:** 2025-02-01  
**Scope:** Routes, auth, API/data flow, DB/state, UI/UX, hardcoding, error handling, performance

---

## ✅ VERIFIED & SOLID

### Routing & Navigation
- **Routes enumerated and consistent:** Public `/login`; protected (under `/`): `/` (dashboard), `/inventory`, `/orders`, `/pos`, `/reports`, `/users`, `/settings`. Catch-all `*` → `<Navigate to="/" replace />`.
- **Route guards:** `ProtectedRoutes` checks `isAuthenticated`/`isLoading` and redirects to `/login` when not authenticated. Each nested route uses `ProtectedRoute` with permission(s). Access denied renders `AccessDenied` with “Go Back” (history.back()).
- **Redirects:** Unauthenticated visit to any protected path → `/login`. Login success → `navigate('/', { replace: true })`. Logout clears state and Sidebar/Header/MobileMenu call `navigate('/login', { replace: true })` after `logout()`.
- **Live check:** Unauthenticated load of `https://warehouse.extremedeptkidz.com` → redirects to `/login`. Navigate to `/nonexistent` → redirects to `/` (no orphan route; catch-all behaves as designed).
- **Sidebar:** Nav links match routes; items filtered by `hasPermission` / `hasAnyPermission` so only allowed routes are shown.

### Authentication & Authorization
- **Login flow:** `AuthContext.login()` POSTs to `/admin/api/login` (404 fallback to `/api/auth/login`), normalizes user, sets state + `localStorage` (`current_user`, `auth_token` when present). User-friendly errors for network/server unreachable.
- **Logout:** POSTs to `/admin/api/logout` (404 fallback to `/api/auth/logout`); always clears `user`, `current_user`, `auth_token` in `finally`.
- **Session check:** On mount, GET `/admin/api/me` (404 → `/api/auth/user`); on success sets user; on failure/network error clears user (no crash).
- **Auth state:** Single source in `AuthContext`; consumed via `useAuth()`. No duplicated auth logic in UI components.
- **RBAC:** Permissions from `types/permissions`; `hasPermission`, `hasAnyPermission`, `hasAllPermissions` used by `ProtectedRoute` and Sidebar. Role limits (discount, refund, etc.) implemented in `canPerformAction` / `requireApproval`.

### API & Data Flow (where implemented)
- **Inventory load:** `InventoryContext.loadProducts()` GETs `/admin/api/products` (404 → `/api/products`), uses `handleApiResponse`, normalizes products, sets state. On network/API error: user-friendly message, fallback to `warehouse_products` from localStorage.
- **Inventory add:** `addProduct()` POSTs to same products API; on success appends saved product to state and persists to localStorage. On failure throws with message; UI shows toast.
- **Orders load:** `OrderContext.loadOrders()` GETs `/api/orders`, normalizes dates and nested objects, sets state. Non-ok or throw → `setOrders([])`.
- **API config:** `API_BASE_URL` from `VITE_API_BASE_URL` with fallback; `getApiHeaders()` includes token when present; `handleApiResponse` throws on `!response.ok` with message from body.
- **Error handling:** Load paths catch errors, set error state or fallback data, show toasts/messages. No silent failures in load/add product flows.

### UI/UX (working as implemented)
- **Login:** Form validation, loading state, “Continue offline” when server unreachable.
- **Inventory:** Loading/error/empty states; search, filters, table/grid, add/edit/delete (local + API for add); “Sync recorded items to server”; export CSV; bulk select/delete.
- **Reports:** Sales vs inventory report type; date range; metrics, charts, tables; Export CSV.
- **POS:** Cart add/update/remove, discount, tax (15%), total; payment panel; receipt.
- **Toast:** Success/error/warning toasts; fixed position, dismiss.
- **Error boundary:** Wraps `App` in `main.tsx`; catches render errors, shows “Something went wrong” + Refresh.

### Resilience & Config
- **Offline:** Inventory falls back to localStorage on load failure; login offers “Continue offline”; POS queues transactions in `offline_transactions` and syncs on `online` event.
- **Settings:** Business/system settings in `SettingsContext` with localStorage persistence; defaults for business name, tax, currency (GHS).

---

## ⚠️ ISSUES FOUND (WITH SEVERITY)

### Critical

| # | Severity | Location | Why it's a problem | What breaks if ignored |
|---|----------|----------|--------------------|--------------------------|
| 1 | **Critical** | `InventoryContext.tsx`: `updateProduct`, `deleteProduct`, `deleteProducts` (lines 262–279) | These only update local state and localStorage; no PUT/DELETE to API. | Edits and deletes are not persisted to server. Other devices and refreshes (after re-fetch) will show old data. Data loss and inconsistency. |
| 2 | **Critical** | `OrderContext.tsx`: `createOrder`, `updateOrderStatus`, `assignDriver`, `markAsDelivered`, `markAsFailed`, `cancelOrder` (throughout) | All order mutations are local only; no POST/PUT to `/api/orders`. | Orders exist only in memory and localStorage. No backend record; no multi-device or audit trail. |
| 3 | **Critical** | `POSContext.tsx`: `processTransaction` (lines 191–247) | When **online**, transaction is written only to localStorage and local inventory; no POST to `/api/transactions`. Sync runs only in `syncOfflineTransactions` on `online` event. | When user is always online, sales are never sent to the API. Revenue and reporting are wrong; no server record of transactions. |

### High

| # | Severity | Location | Why it's a problem | What breaks if ignored |
|---|----------|----------|--------------------|--------------------------|
| 4 | **High** | `App.tsx` line 23; `Users` route (lines 112–118) | Users page is a placeholder: `<Users />` is a static div “Users”. | Nav item “Users” leads to a non-functional page; looks like a dead button to staff. |
| 5 | **High** | `MobileMenu.tsx`: `navigation` array (lines 16–24) | All nav items (Dashboard, Inventory, Orders, POS, Reports, Users, Settings) are shown regardless of permissions. | Users without e.g. Reports permission still see “Reports”; they get Access Denied only after click. Confusing and inconsistent with Sidebar. |
| 6 | **High** | `Sidebar.tsx` / `MobileMenu.tsx`: Role switcher `<select>` (Sidebar 100–114, MobileMenu 82–94) | Demo role switcher is visible to all users and persists in localStorage (`warehouse_demo_role`). | In production, any user can elevate to Admin/Manager; security and audit trail are compromised. |
| 7 | **High** | `constants/defaultCredentials.ts` + `UserManagement.tsx` (e.g. 61, 187, 193) | Default password `EDK-!@#` and domain are hardcoded and displayed in Settings → User Management. | If deployed as-is, default credentials are exposed in UI and code; high security risk. |

### Medium

| # | Severity | Location | Why it's a problem | What breaks if ignored |
|---|----------|----------|--------------------|--------------------------|
| 8 | **Medium** | `App.tsx` line 132 | Catch-all is `<Route path="*" element={<Navigate to="/" replace />}>`. No dedicated 404 page. | Invalid URLs (e.g. typo) send user to dashboard (or login if not authenticated). No “page not found” message; can confuse staff. |
| 9 | **Medium** | `Header.tsx`: Search input (lines 20–26) | Input has no `value` or `onChange`; not connected to any state or search handler. | Header search looks usable but does nothing; dead UI. |
| 10 | **Medium** | `Header.tsx`: Notifications button (lines 43–49) | No `onClick` or navigation. | Button suggests notifications but has no behavior; dead UI. |
| 11 | **Medium** | `Dashboard.tsx`: “View Low Stock Items →” and “Restock Now →” (lines 111–112, 131–132) | Buttons have no `onClick`. | Alerts are visible but actions do nothing; staff may think they clicked something. |
| 12 | **Medium** | `AuthContext.tsx`: `requireApproval` (lines 239–245) | Uses `window.confirm()` for manager approval simulation. | Brittle and not suitable for real workflows; no audit log or proper approval flow. |
| 13 | **Medium** | `POSContext.tsx` line 217 | `cashier: 'Current User'` hardcoded in every transaction. | Receipts and reports show “Current User” instead of actual user; accountability and reporting are wrong. |
| 14 | **Medium** | `OrderContext.tsx` lines 186, 233 | `createdBy: 'current-user'`, `updatedBy: 'current-user'`. | Order history does not reflect real user; auditing and support are hindered. |

### Low

| # | Severity | Location | Why it's a problem | What breaks if ignored |
|---|----------|----------|--------------------|--------------------------|
| 15 | **Low** | `Dashboard.tsx`: `stats.todaySales`, `stats.todayTransactions`, `stats.monthSales`, `salesData`, `recentActivity` (lines 26–35) | Always 0 or `[]`; trend values (e.g. 12.5%, 8.2%) are hardcoded in StatCard. | Dashboard shows “Today’s Sales” and trends that are not real data; misleading. |
| 16 | **Low** | `OrderContext.tsx` line 255 | `assignedTo: uuidv4()` for driver. | Driver ID is a random UUID, not a real user/driver reference. | Order assignment is not tied to real drivers. |

---

## 🧹 HARDCODED / TECH DEBT FINDINGS

### ❌ Dangerous (will break or expose in production)
- **`lib/api.ts` line 7:** `API_BASE_URL` fallback `'https://extremedeptkidz.com'`. If `VITE_API_BASE_URL` is not set in build, production may point to wrong host. **Fix:** Ensure env is set per environment; remove or restrict fallback in production build.
- **`constants/defaultCredentials.ts`:** `DEFAULT_USER_EMAIL_DOMAIN`, `DEFAULT_USER_PASSWORD` ('EDK-!@#'). **Fix:** Do not ship default password in client code; use backend-only defaults or remove from frontend bundle; do not display in User Management in production.
- **`components/settings/UserManagement.tsx`:** Displays shared password and role@domain in UI. **Fix:** Remove or restrict to internal/admin-only docs; never expose in production UI.

### ⚠️ Risky (brittle or confusing)
- **`contexts/SettingsContext.tsx` lines 29–44:** Default business: `businessName: 'Extreme Dept Kidz'`, `address: 'Accra, Greater Accra, Ghana'`, `phone: '+233 XX XXX XXXX'`, `email: 'info@extremedeptkidz.com'`, `taxRate: 15`, `currency: 'GHS'`. **Fix:** Keep as defaults but ensure Settings UI allows override and persistence.
- **`contexts/POSContext.tsx` line 25:** `TAX_RATE = 0.15` (15%). **Fix:** Use `SettingsContext.businessSettings.taxRate` (e.g. divide by 100) so tax is configurable.
- **`components/pos/Receipt.tsx` line 32:** `Tel: +233 XX XXX XXXX`. **Fix:** Use `businessSettings.phone` from Settings.
- **`lib/utils.ts` line 59:** `DEFAULT_LOCATION = { warehouse: 'Main Store', ... }`. **Fix:** Prefer setting from Settings (e.g. `defaultWarehouse`) when available.
- **Dashboard StatCard trend values** (e.g. 12.5%, 8.2%): Hardcoded. **Fix:** Compute from real data or remove until real metrics exist.

### 🧹 Cleanup (should be refactored)
- **AuthContext:** Demo role key `warehouse_demo_role` and `switchRole` are for demo only. **Fix:** Guard behind feature flag or build flag and hide role switcher in production.
- **OrderContext:** `createdBy`/`updatedBy` and **POSContext** `cashier`: **Fix:** Pass current user from `useAuth().user` (e.g. `user.fullName` or `user.id`).
- **reportService.ts:** Mock-detection (e.g. `SKU-2024`, `createdBy === 'admin'`) and `isMockTransaction`/`isMockProduct`. **Fix:** Keep for filtering demo data but document; consider server-side “demo mode” flag instead of client heuristics.
- **InventoryContext.clearMockData:** Hardcoded strings `SKU-2024`, `createdBy === 'admin'`, etc. **Fix:** Centralize mock indicators or remove when mock data is no longer used.

---

## 🔧 REQUIRED FIXES (PRIORITIZED)

1. **Inventory writes (Critical)**  
   - In `InventoryContext`, implement:  
     - `updateProduct(id, updates)` → PUT to `/admin/api/products/:id` (or equivalent), then update state on success.  
     - `deleteProduct(id)` / `deleteProducts(ids)` → DELETE to API, then remove from state on success.  
   - On API failure: show toast, do not change local state (or implement retry/queue).

2. **Orders API (Critical)**  
   - In `OrderContext`:  
     - `createOrder` → POST to `/api/orders` with order payload; use returned order (e.g. id, timestamps) in state.  
     - `updateOrderStatus`, `assignDriver`, `markAsDelivered`, `markAsFailed`, `cancelOrder` → PATCH/PUT to `/api/orders/:id` (or equivalent), then update state from response.  
   - Handle errors (toast, optional rollback); keep loading state for mutations.

3. **POS transactions when online (Critical)**  
   - In `POSContext.processTransaction`: when `isOnline === true`, POST transaction to `/api/transactions` before or immediately after updating local inventory. On success, clear cart and optionally store in `transactions`; on failure, show error and do not clear cart (or queue for retry).  
   - Ensure backend returns saved transaction (id, etc.) and that reporting can use server data.

4. **Users page (High)**  
   - Replace placeholder `Users` component with a real page: list users (from API if available), or “Coming soon” with no misleading actions. Remove or implement Users route and permission consistently.

5. **Mobile nav permissions (High)**  
   - In `MobileMenu.tsx`, filter `navigation` by same permission rules as Sidebar (e.g. `hasPermission` / `hasAnyPermission`) so only allowed routes are shown.

6. **Role switcher (High)**  
   - Hide role switcher in production: e.g. `import.meta.env.PROD` or feature flag. If kept for demo, restrict to a dedicated “Demo” or dev build and do not persist `warehouse_demo_role` in production.

7. **Default credentials (High)**  
   - Remove default password from client bundle and from User Management UI in production; use backend/env for any default credentials; do not expose in frontend.

8. **404 handling (Medium)**  
   - Add a dedicated 404 route (e.g. path `*` rendering a “Page not found” component with link to `/`) instead of redirecting all unknown paths to `/`.

9. **Header search & notifications (Medium)**  
   - Either wire Header search to a global product search (e.g. navigate to `/inventory?q=...` or open a search modal) or make it clearly non-interactive (e.g. “Search coming soon”).  
   - Add notifications panel/route or remove/disable the button and label as “Coming soon.”

10. **Dashboard alert buttons (Medium)**  
    - “View Low Stock Items” → e.g. `navigate('/inventory', { state: { filter: 'lowStock' } })` or set filter in Inventory.  
    - “Restock Now” → same or open add-product flow; implement minimal useful behavior.

11. **Current user in POS and Orders (Medium)**  
    - In `POSContext.processTransaction`, set `cashier` from `useAuth().user` (e.g. `user?.fullName` or `user?.email`).  
    - In `OrderContext`, set `createdBy` / `updatedBy` from `useAuth().user` (e.g. `user?.id` or `user?.email`). Pass auth into context via provider or hook.

12. **Tax rate and receipt (Medium / Cleanup)**  
    - Use `useSettings().businessSettings.taxRate` (and currency) in POS for tax calculation.  
    - Use `businessSettings.phone` (and address) in Receipt instead of hardcoded “+233 XX XXX XXXX”.

---

## 🚀 OPTIONAL IMPROVEMENTS

- **Dashboard:** Replace hardcoded `todaySales`, `monthSales`, and trend values with real data (e.g. from transactions API or report service); add `recentActivity` from orders/transactions.
- **Error handling:** Consistently show toasts for failed API calls (orders, transactions); avoid console-only errors; consider global “retry” for network errors.
- **Loading states:** Add loading indicators for all mutations (order create/update, transaction submit, inventory update/delete) so staff see feedback.
- **Optimistic updates:** For inventory/orders, consider optimistic UI with rollback on API failure to improve perceived performance while keeping server as source of truth.
- **Abstractions:** Centralize API client (e.g. one module for `get/post/put/delete` with auth headers, base URL, and error handling) to avoid duplicated fetch logic.
- **Tests:** Add E2E tests for: login → dashboard, add product, create order, complete POS sale, logout; and for permission-based routing and 404.
- **Performance:** Lazy-loaded pages are in place; consider memoizing heavy report computations and avoiding unnecessary re-fetches (e.g. stable keys for list components).
- **PWA / Service worker:** `main.tsx` registers `/sw.js`; ensure `sw.js` exists and does not cache API responses inappropriately.

---

## 🛑 SUMMARY

- **Routing and auth** are in good shape: guards, redirects, and session handling are consistent; live check confirms redirect to login and catch-all behavior.
- **Critical gaps** are **write paths**: inventory updates/deletes, all order mutations, and online POS transactions are not persisted to the backend. Fixing these is non-negotiable for production.
- **High-impact issues** include the placeholder Users page, MobileMenu showing all links regardless of permissions, exposed role switcher and default credentials.
- **Medium** items are dead or misleading UI (header search, notifications, dashboard alert buttons), no 404 page, and hardcoded user identifiers in POS/Orders.
- **Hardcoding and tech debt** are documented with clear “Dangerous / Risky / Cleanup” and file:line references; prioritized fixes above address the most important ones first.

**Recommendation:** Do not treat the system as production-ready until Critical items 1–3 (inventory writes, orders API, online POS sync) are implemented and tested end-to-end with the real backend. Then address High and selected Medium items, and run a full regression (including login, logout, and permission-based access) with real credentials on the deployed URL.
