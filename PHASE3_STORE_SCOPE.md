# Phase 3: Store Awareness and Scope-Aware Access

**Goal:** Introduce store entity and scope-aware access so admins can answer “which store is performing best?”, “which warehouse feeds which store?”, and “which POS devices operate under each store?” — without breaking existing users or data.

**Constraints honored:** No breaking changes, no data deletion/renaming/mutation, no forced migrations, no required new fields, no role renaming, no inventory logic changes, no POS checkout regression. Everything additive, nullable, backward compatible.

---

## Why Scope ≠ Role

- **Role** (admin, manager, cashier, warehouse, driver, viewer) defines **what** you are allowed to do (permissions). Roles are unchanged in Phase 3.
- **Scope** defines **where** you can do it: which store(s), warehouse(s), and POS device(s). Scope is stored in `user_scopes` (keyed by user email). Absence of scope rows = **unrestricted** (legacy behavior).
- One role (e.g. `cashier`) is reused across many POS; the difference is scope: Store A vs Store B, Warehouse A vs Warehouse B. No role explosion (no POS_STORE_1, etc.).

---

## What Was Added

### 1. Database (additive only)

- **Migration:** `20250209500000_phase3_stores_and_scope.sql`
  - **stores** table: `id` (uuid PK), `name` (text), `status` (active | inactive), `created_at`, `updated_at`. New, optional; no retroactive assignment.
  - **warehouses.store_id** (uuid, nullable, FK to stores). Warehouses may belong to one store or remain unassigned (legacy).
  - **user_scopes** table: `user_email` (text), `store_id` (uuid nullable), `warehouse_id` (uuid nullable), `pos_id` (text nullable). Multiple rows per user = union of allowed scope. No rows = unrestricted (legacy).

### 2. Scope resolution (server-side)

- **resolveUserScope(session):**
  - Admin/super_admin → full access (`isUnrestricted: true`).
  - Non-admin → query `user_scopes` by session email; return distinct `allowedStoreIds`, `allowedWarehouseIds`, `allowedPosIds`. Empty sets = unrestricted (legacy).
- **Helpers:** `isStoreAllowed`, `isWarehouseAllowed`, `isPosAllowed` (true when unrestricted or id in allowed set).
- **Logging:** `[SEC-SCOPE-DENY]` when user tries to access out-of-scope store/warehouse/pos (log only where we also return 403).

### 3. API behavior (backward compatible)

- **GET /api/stores** — New. Auth required. Returns all stores for admin; for non-admin returns only stores in scope (empty scope = all, when API returns all).
- **GET /api/stores/[id]** — New. 403 when scoped user requests a store not in allowed set.
- **GET /api/warehouses** — Optional query `store_id` to filter by store. Non-admin: results filtered by `allowedWarehouseIds` when scope is set. Response includes `storeId` (nullable).
- **GET /api/warehouses/[id]** — 403 when scoped user requests a warehouse not in allowed set.
- **GET /api/transactions** — Now requires auth (not admin-only). Admin/unrestricted: full list with optional filters. Scoped: results restricted to allowed store/warehouse/pos; client-provided filters that are out of scope are ignored and scope filter applied.
- **POST /api/transactions** — After resolving effective warehouse (Phase 1), if user has scope and warehouse is not in `allowedWarehouseIds`, 403 and log `[SEC-SCOPE-DENY]`.

### 4. Admin dashboard (non-disruptive)

- **Sales by store** — Last 30 days transactions grouped by `store_id`; table shows store name, transaction count, revenue. Graceful when no stores or no data.
- **Warehouse → Store** — Table of warehouses with assigned store name (or — when unassigned). Shown when stores and warehouses exist; no empty screen.

### 5. POS and staff UX

- **Store selector** — When multiple stores (API returns > 1), POS shows a store dropdown. When one store, shows “Store: {name}” only (auto-selected). When no stores, no store row.
- **Warehouse** — Unchanged (Phase 1): session-bound warehouse hides selector; otherwise selector when multiple warehouses. Staff only see stores/warehouses returned by API (already scoped).

---

## How Backward Compatibility Is Preserved

- **Legacy users (no rows in user_scopes):** `resolveUserScope` returns empty allowed sets → `isUnrestricted: true` → no scope filter on reads, no 403 on writes. Behavior unchanged.
- **Existing warehouses:** `store_id` is nullable; no backfill. Unassigned warehouses continue to work; GET /api/warehouses returns them with `storeId: null`.
- **Existing transactions:** Already have nullable `store_id`, `pos_id` (Phase 2). No schema change in Phase 3 for transactions.
- **Roles:** Unchanged. No new roles, no renaming. Scope is applied in addition to role (e.g. cashier + scope = cashier allowed only in those stores/warehouses).

---

## How Multi-Store Clients Scale Safely

1. **Create stores** (e.g. Store A, Store B) in `stores` table (admin or future CRUD).
2. **Assign warehouses** to stores via `warehouses.store_id` (optional).
3. **Assign staff** by inserting `user_scopes` rows: e.g. `(cashier@example.com, store_a_id, warehouse_a_id, 'POS-01')`. Multiple rows per user = multiple allowed (store, warehouse, pos) combinations. **In-app:** Settings → Users → "Store & warehouse access": enter user email, add store+warehouse pairs, Save (admin-only API: GET/PUT `/api/user-scopes`).
4. **POS:** Staff logs in; frontend loads GET /api/stores and GET /api/warehouses (already scoped). One store → auto-select; multiple → selector. Session-bound warehouse (Phase 1) still overrides for mutations.
5. **Admin** sees all stores, all warehouses, all transactions; can filter by store/warehouse/pos. Scoped managers see only their stores’ data.

---

## Security Guarantees

- Scope is enforced **server-side**. Client filters (e.g. `store_id` in query) are not trusted; allowed sets are applied from `user_scopes`.
- Out-of-scope access attempts are logged with `[SEC-SCOPE-DENY]` and return 403 where applicable (single resource by id, or POST to disallowed warehouse).
- Legacy paths (no scope rows) are not blocked; no change to inventory logic or POS checkout flow.

---

## Files Touched

| Area | Files |
|------|--------|
| Migration | `inventory-server/supabase/migrations/20250209500000_phase3_stores_and_scope.sql` |
| Data | `inventory-server/lib/data/stores.ts`, `inventory-server/lib/data/userScopes.ts`, `inventory-server/lib/data/warehouses.ts` (storeId, getWarehouses options), `inventory-server/lib/data/transactions.ts` (scope filters) |
| Auth/scope | `inventory-server/lib/auth/scope.ts` |
| API | `inventory-server/app/api/stores/route.ts`, `inventory-server/app/api/stores/[id]/route.ts`, `inventory-server/app/api/warehouses/route.ts`, `inventory-server/app/api/warehouses/[id]/route.ts`, `inventory-server/app/api/transactions/route.ts` |
| Frontend | `src/types/index.ts` (Store, Warehouse.storeId, Transaction.storeId/posId), `src/contexts/StoreContext.tsx`, `src/App.tsx`, `src/pages/Dashboard.tsx`, `src/pages/POS.tsx`, `src/services/transactionsApi.ts` (storeId/posId in response) |
| Doc | `warehouse-pos/PHASE3_STORE_SCOPE.md` |

---

## Verification Checklist

- [ ] Admin sees all stores and all transactions; can filter by store/warehouse/pos.
- [ ] Manager (with user_scopes rows) sees only assigned store(s) and their data.
- [ ] Cashier POS: when scoped to one store, only that store is shown/selected; when scoped to one warehouse (or session-bound), warehouse selector hidden.
- [ ] One store’s POS cannot affect another store’s inventory (warehouse scope enforced on POST /api/transactions; warehouse belongs to store when store_id set).
- [ ] Legacy users (no user_scopes rows) still have full access (unrestricted).
- [ ] No inventory logic changes; no POS checkout regression.
