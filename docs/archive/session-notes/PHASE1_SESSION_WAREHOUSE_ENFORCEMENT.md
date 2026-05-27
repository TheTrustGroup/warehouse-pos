# Phase 1: Session Hardening & Server-Side Warehouse Enforcement

**Completed:** Session binding (additive), server-side warehouse override, auth tightening, POS UX when bound, guardrail logging.  
**Constraints honored:** No existing data changed; no table/column renames; no new required request fields; inventory quantities untouched.

---

## Summary of Changes

### 1. Session hardening (additive)

- **Session payload** now optionally includes:
  - `warehouse_id` (string, optional)
  - `store_id` (string | null, optional)
  - `device_id` (string, optional)
- **Backward compatible:** Existing tokens and cookies without these fields still parse and work; `parseTokenValue` only adds optional fields when present.
- **Login** (both `/api/auth/login` and `/admin/api/login`) accepts optional body fields: `warehouse_id`, `store_id`, `device_id`. None are required. When provided, they are stored in the session token and cookie.
- **`sessionUserToJson`** includes `warehouse_id`, `store_id`, `device_id` in the user object when present so the frontend can hide the warehouse selector and show “Bound to location”.

### 2. Server-side warehouse enforcement

- **Endpoints:** POST `/api/transactions`, POST `/api/orders/deduct`, POST `/api/orders/return-stock`.
- **When `session.warehouse_id` exists:**  
  The effective warehouse for the request is **always** `session.warehouse_id`. Any `body.warehouseId` / `body.warehouse_id` is ignored for execution (server overrides).  
  A **server-side log (warning only)** is written when the body warehouse differs from the session warehouse: `[SessionWarehouse] body.warehouse_id differs from session.warehouse_id (overriding)` with path, method, session_warehouse_id, body_warehouse_id, email. Requests are **not** blocked; behavior is observe-first.
- **When `session.warehouse_id` does not exist:**  
  Behavior is unchanged: effective warehouse is taken from the request body. No new required fields.

### 3. Authorization tightening (non-breaking)

- **POST `/api/orders/deduct`** and **POST `/api/orders/return-stock`** now use `requireWarehouseOrPosRole()` instead of `requireAuth()`.
  - Allowed roles: `admin`, `super_admin`, `manager`, `cashier`, `warehouse`.  
  - `driver` and `viewer` receive 403 (previously they could call with any auth).
- **POST `/api/transactions`** unchanged: still uses `requirePosRole()` (admin, super_admin, manager, cashier). Admins retain full access on all three endpoints.

### 4. POS UX when session is bound

- **WarehouseContext** now:
  - Reads `auth?.user?.warehouseId` (from API user/me response).
  - When set (`boundWarehouseId`), uses it as the **effective** warehouse: `currentWarehouseId` exposed to consumers is `boundWarehouseId` when present, else the selected warehouse. `setCurrentWarehouseId` is a no-op when bound (selector not shown).
  - Exposes `isWarehouseBoundToSession` so the POS UI can hide the warehouse dropdown.
- **POS page:** When `isWarehouseBoundToSession` is true:
  - The warehouse **selector is hidden** (no dropdown to change warehouse).
  - “Selling from: [name]” is still shown, with a “Bound to location” badge (lock icon).  
  The selector is **not** removed globally; it only disappears when the session has a bound warehouse.

### 5. Guardrails and logging

- **Logging only:** When `session.warehouse_id` is set and `body.warehouse_id` is present and different, the server logs the warning above. No 4xx, no blocking.
- **No change** to inventory quantities, transaction history, or product data.

---

## Exact Files Touched

| File | Change |
|------|--------|
| `inventory-server/lib/auth/session.ts` | Extended `Session` with optional `warehouse_id`, `store_id`, `device_id`. Added `CreateSessionOptions`; `createSessionToken(email, role, options?)`; `setSessionCookie(..., options?)`; `parseTokenValue` reads optional fields; `sessionUserToJson` returns them when set. Added `requireWarehouseOrPosRole`, `getEffectiveWarehouseId` (override + log). |
| `inventory-server/lib/auth/roles.ts` | Added `canWarehouseDeductOrReturn(role)`. |
| `inventory-server/app/api/auth/login/route.ts` | Read optional `warehouse_id`, `store_id`, `device_id` from body; pass to `createSessionToken` / `setSessionCookie`; build session payload for `sessionUserToJson`. |
| `inventory-server/app/admin/api/login/route.ts` | Same as above. |
| `inventory-server/app/api/transactions/route.ts` | Use `getEffectiveWarehouseId(auth, bodyWarehouseId, context)` for `warehouseId`; log when body differs from session (no block). |
| `inventory-server/app/api/orders/deduct/route.ts` | Switch to `requireWarehouseOrPosRole`; use `getEffectiveWarehouseId` for warehouse; log when body differs. |
| `inventory-server/app/api/orders/return-stock/route.ts` | Same as above. |
| `inventory-server/app/api/auth/user/route.ts` | No code change; already returns `sessionUserToJson(auth)`, which now includes optional binding fields when present. |
| `inventory-server/app/admin/api/me/route.ts` | No code change; same as above. |
| `src/types/index.ts` | Added to `User`: optional `warehouseId`, `storeId`, `deviceId`. |
| `src/contexts/AuthContext.tsx` | In `normalizeUserData`, set `warehouseId`, `storeId`, `deviceId` from API response (`warehouse_id` / `store_id` / `device_id`). |
| `src/contexts/WarehouseContext.tsx` | When `auth?.user?.warehouseId` set: use as effective warehouse, no-op `setCurrentWarehouseId` when bound, expose `isWarehouseBoundToSession`; sync `currentWarehouseId` to bound id when bound; only persist to localStorage when not bound. |
| `src/pages/POS.tsx` | Use `isWarehouseBoundToSession`; when true, hide warehouse dropdown and show “Bound to location” badge; when false and multiple warehouses, show selector as before. |

---

## Confirmation: No Existing Data Paths Broken

- **Existing sessions:** Tokens/cookies without `warehouse_id`/`store_id`/`device_id` parse as before; only `email`, `role`, `exp` are required. No existing session is invalidated.
- **Existing clients:** No new required request fields. Sending only `email` (and password where applicable) on login still works. Sending only `warehouseId` in body for transactions/deduct/return-stock still works when the session has no `warehouse_id`.
- **Existing APIs:** Response shapes for login and user/me are extended with optional keys; existing clients that ignore unknown keys are unaffected. GET `/api/products`, GET `/api/warehouses`, and all other endpoints are unchanged.
- **Database:** No migrations, no new tables, no column renames. No reads/writes to `warehouse_inventory` or `transactions` tables were changed beyond using the same `warehouse_id` as before when session has no binding (body warehouse used as today).

---

## Explicit Confirmation: Inventory Quantities Unaffected

- **No inventory rows were updated, deleted, or backfilled.**  
- **No changes** to `warehouse_inventory`, `warehouse_products`, or `transactions` schema or data.  
- **Behavior:** When a request is allowed, the warehouse used for deduction/return/transaction is either (a) `session.warehouse_id` if set, or (b) `body.warehouse_id` as today. The same RPCs and same row updates run as before; only the **source** of the warehouse id can now be the session instead of the body when binding is present.  
- **Quantities** are only changed by the same flows as before (e.g. `process_sale`, `process_sale_deductions`, `process_return_stock`), with no new update paths and no retroactive adjustments.

---

## How to Use Binding (Optional)

- **Login with binding (e.g. POS terminal):**  
  POST body can include optional `warehouse_id`, `store_id`, `device_id`. Example:  
  `{ "email": "cashier@example.com", "password": "...", "warehouse_id": "uuid-of-warehouse", "device_id": "POS-01" }`  
  After login, the session is bound to that warehouse; the server will use it for transactions/deduct/return and the POS UI will hide the warehouse selector and show “Bound to location”.

- **Login without binding:**  
  Send only `email` (and password). Behavior is as before: warehouse is chosen in the UI and sent in the request body; server uses body when session has no `warehouse_id`.

- **Observe logs:**  
  In server logs, search for `[SessionWarehouse]` to see when body and session warehouse differ (overrides in place; no blocking).
