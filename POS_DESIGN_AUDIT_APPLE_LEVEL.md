# Apple-Level System Audit: warehouse.extremedeptkidz.com

**Source of truth:** CONTEXT.MD/POS (roles = permissions; context = scope; sessions bind the two).  
**Constraints:** No deletion or mutation of existing inventory; no reset of roles; no table/field renames; no breaking API changes. All recommendations additive, guarded, or read-only.

---

## SECTION A: Current State Findings (Facts Only)

### A.1 Role System

| Finding | Location / Detail |
|--------|-------------------|
| **Roles defined** | Backend: `super_admin`, `admin`, `manager`, `cashier`, `warehouse`, `driver`, `viewer` (inventory-server `lib/auth/roles.ts`). Frontend: same set in `src/types/permissions.ts` with permission arrays per role. |
| **Role derivation** | Server-only: `getRoleFromEmail(email)` — admin list from `ALLOWED_ADMIN_EMAILS` env; otherwise role from email local part (e.g. `cashier@…` → cashier). Session token contains `email` + `role`; role is never read from request body. |
| **Roles are permission-based** | No role names include store or warehouse (e.g. no `POS_STORE_1`). Roles define capabilities (e.g. `canAccessPos`, `isAdmin`); no location in role identity. |
| **Admin-level gating** | `requireAdmin()` used on: `/admin/api/products` (GET/POST), `/admin/api/products/[id]` (GET/PUT/DELETE), `/admin/api/products/bulk`, `/api/products` (POST), `/api/products/[id]` (PUT/DELETE), `/api/products/bulk`. Unauthorized admin attempts log path, method, email, role and return 403. |
| **POS gating** | `requirePosRole()` used on: POST `/api/transactions`, POST `/api/inventory/deduct`. Cashier+ (admin, super_admin, manager, cashier) can call these. |
| **Weaker gating** | POST `/api/orders/deduct` and POST `/api/orders/return-stock` use `requireAuth()` only (any authenticated user). No role check; warehouse/driver/viewer can deduct/return for any warehouse. |
| **UI route protection** | All protected routes use `ProtectedRoute` with permission (e.g. `PERMISSIONS.POS.ACCESS`, `PERMISSIONS.INVENTORY.VIEW`). Sidebar filters nav by `hasPermission` / `hasAnyPermission`. "Switch role" dropdown visible only to admin/super_admin. |
| **Demo role switch** | `switchRole(roleId)` in AuthContext persists to localStorage (`warehouse_demo_role`) and updates local user; used only when user is already admin/super_admin (Sidebar). Backend is never told; session role unchanged. |

### A.2 POS Session Context

| Finding | Location / Detail |
|--------|-------------------|
| **Session payload** | Session type: `{ email, role, exp }`. No `store_id`, `warehouse_id`, `device_id`, or `pos_id` (inventory-server `lib/auth/session.ts`). |
| **Warehouse selection** | Frontend: `WarehouseContext` holds `currentWarehouseId` (initialized from localStorage `warehouse_current_id` or `DEFAULT_WAREHOUSE_ID`). User can change warehouse via dropdown on POS and elsewhere; selection is not bound to session or device. |
| **POS warehouse usage** | POS uses `currentWarehouseId` from `useWarehouse()` for cart and for `processTransaction` payload (`warehouseId: currentWarehouseId`). No server-side check that the authenticated user is allowed to operate that warehouse. |
| **Warehouse list** | GET `/api/warehouses` returns all warehouses; any authenticated user can list and select any warehouse. No filtering by user or "allowed warehouses". |
| **Binding** | There is no mandatory "this login is bound to one store + one warehouse". Binding is UI-only (current selection), not server-enforced. |

### A.3 Warehouse Inventory Scoping

| Finding | Location / Detail |
|--------|-------------------|
| **Inventory storage** | Quantity in `warehouse_inventory(warehouse_id, product_id, quantity)`. All reads/writes in `lib/data/warehouseInventory.ts` take `warehouseId`; no unfiltered quantity read. |
| **Product list API** | GET `/api/products` accepts optional `warehouse_id`; backend `getWarehouseProducts(warehouseId)` uses `warehouseId || getDefaultWarehouseId()`. Quantity is always for that single warehouse. |
| **Deduction** | `process_sale_deductions(p_warehouse_id, p_items)` and `process_sale(p_warehouse_id, ...)` use provided warehouse id; deduction is scoped to that warehouse. |
| **Client product path** | InventoryContext sends `warehouse_id` in query via `productsPath(..., effectiveWarehouseId)`; effective warehouse is `currentWarehouseId` or `DEFAULT_WAREHOUSE_ID`. |
| **Orders deduct / return** | POST `/api/orders/deduct` and `/api/orders/return-stock` accept `warehouseId` in body; server uses it for `processSaleDeductions` / `processReturnStock`. No server-side validation that the user may use that warehouse. |
| **Transactions** | POST `/api/transactions` accepts `warehouseId` from body; passed to `processSale()`. No session-based warehouse constraint. |

### A.4 Sales and Transaction Logging

| Finding | Location / Detail |
|--------|-------------------|
| **DB schema (transactions)** | `transactions`: id, transaction_number, type, **warehouse_id**, subtotal, tax, discount, total, payment_method, payments, **cashier** (text), customer, status, sync_status, created_at, completed_at. No columns: `store_id`, `pos_id`, `operator_id` (or user_id). |
| **Logged today** | warehouse_id ✅, cashier (free text, e.g. name/email) ✅, created_at/completed_at ✅. pos_id ❌, store_id ❌, user_id/operator_id ❌. |
| **Transaction creation** | Client builds transaction with `warehouseId: currentWarehouseId`, `cashier: user?.fullName \|\| user?.email \|\| user?.id \|\| 'system'`. Server persists body; no server-set operator_id. |
| **Idempotency** | `process_sale` RPC is idempotent: if transaction id already exists, returns without deducting again. Client can send Idempotency-Key. |

### A.5 Admin Observability

| Finding | Location / Detail |
|--------|-------------------|
| **Dashboard** | Uses `useInventory().products` (current warehouse only). Stats: total products, stock value, low/out of stock. `todaySales`, `todayTransactions`, `monthSales` are 0; no API for server-side sales. No "per warehouse" or "per store" breakdown. |
| **Reports** | Sales report uses `getStoredData('transactions', [])` (localStorage only). No GET `/api/transactions` in inventory-server. Inventory report uses current warehouse products. No server-aggregated sales or POS activity. |
| **Stock per warehouse** | Admin can switch warehouse in UI and see that warehouse’s products/quantities. No single "admin view" listing all warehouses with stock summary. |
| **POS activity** | No API or UI for "POS terminals active" or "sales per device". No audit log of POS logins or session bindings. |
| **Stock movements** | Table `stock_movements` exists (transaction_id, warehouse_id, product_id, quantity_delta, reference_type, created_at). No API exposed in this codebase to read them. |

### A.6 Performance and Sync

| Finding | Location / Detail |
|--------|-------------------|
| **Product fetch** | GET `/api/products` with `warehouse_id`; backend loads all `warehouse_products` rows then `getQuantitiesForWarehouse(warehouseId)`. Limit/offset supported (default 500, max 2000). Search/category/low_stock/out_of_stock applied server-side in `getWarehouseProducts`. |
| **Client cache** | Per-warehouse cache key `warehouse_products_${warehouseId}`, TTL 60s; localStorage and optional IndexedDB. Warehouse switch triggers refetch. |
| **Realtime** | `useRealtimeSync` polls every 60s when tab visible and runs silent `loadProducts`. No WebSocket or Supabase realtime subscription in frontend. |
| **Concurrent POS** | process_sale and process_sale_deductions are atomic (single DB transaction; row-level deduct). No application-level locking; safe for concurrent sales. |

---

## SECTION B: Risk Assessment (Ranked by Severity)

| # | Severity | Risk | Why |
|---|----------|------|-----|
| 1 | **Critical** | **Client-controlled warehouse scope** | POST `/api/transactions`, `/api/inventory/deduct`, `/api/orders/deduct`, `/api/orders/return-stock` accept `warehouseId` from the request body. A compromised or buggy client could send another warehouse’s id and deduct/move stock there. Session does not bind user to a warehouse; server does not validate "user allowed for this warehouse". |
| 2 | **Critical** | **POS can "switch" warehouse** | CONTEXT.MD/POS: "No switching. No ambiguity." Current UX allows changing warehouse via dropdown on POS. No server-side binding; cashier could sell from Warehouse B while intended to sell only from Warehouse A. |
| 3 | **High** | **Orders deduct/return under-protected** | POST `/api/orders/deduct` and `/api/orders/return-stock` use `requireAuth()` only. Any authenticated user (e.g. viewer, driver) can deduct or return stock for any warehouse. Should be restricted (e.g. warehouse role or POS role) and ideally scoped to session warehouse. |
| 4 | **High** | **Sales not logged with pos_id, store_id, operator_id** | CONTEXT.MD/POS requires sales logged with pos_id, store_id, warehouse_id, operator_id, timestamp. DB has warehouse_id and cashier (text); no store_id, pos_id, or user_id. Auditing "which POS / which operator" is not possible from DB. |
| 5 | **High** | **Admin has no server-side view of sales or POS activity** | No GET `/api/transactions`. Reports and dashboard sales come from localStorage only. Multi-device/multi-POS sales are not aggregated; admin cannot see "sales per store" or "POS activity per device" from backend. |
| 6 | **Medium** | **Demo role switch could confuse testing** | `switchRole` changes only client state; backend still sees real role. If someone assumes backend respects switched role, tests could be misleading. Mitigated by "Switch role" being admin-only and documented as testing. |
| 7 | **Medium** | **Stale reports** | Reports use local transactions; after server persistence, local list may be incomplete or duplicate. No single source of truth for "all transactions" in UI. |
| 8 | **Low** | **Product list scale** | At very large SKU counts, loading all products then merging quantities may be slow; pagination and server-side search exist but limits and behavior may need tuning for 100k+ SKUs. |

---

## SECTION C: Safe Improvements (Additive, Non-Breaking)

### C.1 Session binding (additive)

- **Add optional session context (no change to existing data):**
  - Extend session payload to optionally include `warehouse_id` and, if you introduce stores, `store_id` and `device_id`/`pos_id`. Set these at login or via a dedicated "bind device" step when the POS app starts (e.g. from device config or admin-assigned binding).
  - Keep existing behavior: if session has no warehouse_id, continue to allow requests that send `warehouseId` in body (current behavior). **New, opt-in behavior:** if session has `warehouse_id`, then for POST `/api/transactions`, `/api/inventory/deduct`, and optionally `/api/orders/deduct` and `/api/orders/return-stock`, **override** or **validate** body `warehouseId` against session’s `warehouse_id` (reject or overwrite with session value). This preserves existing clients and adds a safe path for "hard-bound" POS.
- **No DB migration required for session shape** — session is in signed cookie/token; add new optional claims only.

### C.2 Warehouse/scope validation (additive, guarded)

- **Optional allow-list per user:** Add a table or config (e.g. `user_warehouses(user_id, warehouse_id)`) for "this user may use these warehouses". When present, in POST `/api/transactions`, `/api/inventory/deduct`, `/api/orders/deduct`, `/api/orders/return-stock`, check that `body.warehouseId` is in the allowed set for the authenticated user; else 403. If table is empty or not used, skip check (current behavior). No change to existing rows.
- **Strict mode:** If session has `warehouse_id`, require `body.warehouseId === session.warehouse_id` (or allow-list contains body.warehouseId for that user). Deploy behind feature flag or env.

### C.3 Sales logging (additive schema only)

- **Add columns only (append-only, no drop, no backfill required):** Add nullable `store_id`, `pos_id`, `operator_id` (or `user_id`) to `transactions` via migration. Existing rows stay as-is (NULLs). In POST `/api/transactions`, if client sends them, persist; optionally set `operator_id` from session `email` or user id server-side so it cannot be spoofed. No deletion or modification of existing records.

### C.4 Admin observability (read-only, additive)

- **GET `/api/transactions` (read-only):** New endpoint, admin-only (`requireAdmin`), query params: `warehouse_id`, `store_id`, `from`, `to`, `limit`, `offset`. Return list of transactions (and optionally items) for reporting. No writes; no change to existing data.
- **GET `/api/stock_movements` or `/api/warehouses/:id/stock_movements`:** Read-only, admin (or warehouse-scoped role), for audit trail. Append-only table already exists.
- **Dashboard/Reports:** Consume new GET `/api/transactions` and optionally stock_movements so "sales per store/warehouse" and "POS activity" come from server. Keep localStorage as fallback only when API is unavailable.

### C.5 POS UX (additive)

- **Optional "locked warehouse" mode:** If session (or device config) has a single `warehouse_id`, hide warehouse dropdown on POS and show "Selling from: [Name]" only. No backend change required; frontend uses session or config. When no binding, keep current dropdown.

### C.6 Orders deduct (tighten without breaking)

- **Require POS or warehouse role for deduct/return:** Change POST `/api/orders/deduct` and POST `/api/orders/return-stock` from `requireAuth()` to a helper that allows e.g. `requirePosRole` or a new `requireWarehouseOrPosRole()`. Same request shape; only who can call changes. Additive from a "allowed roles" perspective.

---

## SECTION D: Code Touchpoints (No Edits Yet)

| Area | Files / Functions / Endpoints |
|------|-------------------------------|
| **Roles** | `inventory-server/lib/auth/roles.ts` (getRoleFromEmail, isAdmin, canAccessPos), `lib/auth/session.ts` (requireAuth, requireAdmin, requirePosRole, Session type), `src/types/permissions.ts`, `src/contexts/AuthContext.tsx`, `src/components/ProtectedRoute.tsx`, `src/components/layout/Sidebar.tsx`, `src/App.tsx` (route permissions). |
| **Session binding** | `inventory-server/lib/auth/session.ts` (Session interface, createSessionToken, parseTokenValue), login routes: `app/admin/api/login/route.ts`, `app/api/auth/login/route.ts`. Frontend: `AuthContext.tsx` (login, checkAuthStatus), `WarehouseContext.tsx` (currentWarehouseId, setCurrentWarehouseId). |
| **POS warehouse** | `src/contexts/POSContext.tsx` (processTransaction, warehouseId in payload), `src/pages/POS.tsx` (warehouse dropdown, setCurrentWarehouseId), `src/contexts/WarehouseContext.tsx` (warehouses, currentWarehouseId). |
| **Inventory scoping** | `inventory-server/lib/data/warehouseInventory.ts`, `lib/data/warehouseProducts.ts` (getWarehouseProducts, getQuantity, getQuantitiesForProducts, processSaleDeductions), `app/api/products/route.ts` (GET warehouse_id param), `app/api/inventory/deduct/route.ts`, `app/api/transactions/route.ts`. |
| **Transactions / sales** | `inventory-server/lib/data/transactions.ts` (processSale, ProcessSalePayload), `app/api/transactions/route.ts` (POST), `supabase/migrations/20250209200000_transactions_and_stock_movements.sql` (transactions, transaction_items, stock_movements, process_sale RPC). Frontend: `src/contexts/POSContext.tsx` (processTransaction), `src/types/index.ts` (Transaction). |
| **Orders deduct** | `inventory-server/app/api/orders/deduct/route.ts`, `app/api/orders/return-stock/route.ts` (requireAuth only). |
| **Admin / reports** | `src/pages/Dashboard.tsx`, `src/pages/Reports.tsx` (localStorage transactions, generateSalesReport), `src/services/reportService.ts`. No GET transactions or stock_movements in inventory-server. |
| **Products API** | `inventory-server/app/api/products/route.ts` (GET warehouse_id), `lib/data/warehouseProducts.ts` (getWarehouseProducts, getDefaultWarehouseId). |

---

## SECTION E: Explicit List of Things That Must NOT Be Changed

- **Do not** delete or mutate existing inventory records in `warehouse_inventory` or `warehouse_products`.
- **Do not** reset or remove existing roles or permission definitions; do not rename roles in a way that breaks existing sessions or config (e.g. ALLOWED_ADMIN_EMAILS).
- **Do not** rename database tables or columns (e.g. do not rename `transactions` or `warehouse_id`). Additive columns only.
- **Do not** remove or change the contract of existing API endpoints (e.g. POST `/api/transactions` must continue to accept current payload; new fields can be optional).
- **Do not** drop or alter the `process_sale` or `process_sale_deductions` RPCs in a way that changes behavior for current callers; new behavior only via new params or new RPCs.
- **Do not** remove warehouse_id from any request or response where it is currently required or returned.
- **Do not** backfill or overwrite existing `transactions` rows to add new columns; allow NULL for new columns on existing rows.
- **Do not** introduce a change that makes existing POS or admin clients fail (e.g. require new required request fields without a transition path).

---

## Summary

- **Roles:** Permission-based and not store/warehouse-specific; admin and POS are enforced on key routes. Orders deduct/return are under-protected (any auth).
- **Session:** No store_id, warehouse_id, or device_id; no server-side POS binding. Warehouse is chosen in UI only; client can send any warehouseId.
- **Inventory:** All backend reads/writes are warehouse-scoped; deduction and process_sale are atomic and correct by warehouse.
- **Sales logging:** warehouse_id and cashier (text) and timestamps exist; pos_id, store_id, operator_id do not. No GET transactions for admin.
- **Admin:** No server-backed "sales per store" or "POS activity per device"; reports use localStorage only.

**Highest impact, safe next steps:** (1) Add optional session warehouse (and store/device) and validate or override body warehouseId when present. (2) Add optional `store_id`, `pos_id`, `operator_id` to transactions and set from session where possible. (3) Add GET `/api/transactions` (admin) and wire Reports/Dashboard to it. (4) Restrict orders deduct/return to POS or warehouse role.

If a change could risk data loss, duplication, or desync, do not implement it without explicit approval and a rollback plan.
