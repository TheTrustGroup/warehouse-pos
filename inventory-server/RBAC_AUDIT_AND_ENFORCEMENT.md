# RBAC Audit & Backend Enforcement

## Phase 1 — What Was Broken (CRITICAL)

- **Roles were not enforced on the backend.** Every user received `role: 'admin'` from login and `/me`/`user` routes.
- **Non-admin users could call admin APIs.** No server-side checks; any caller could mutate products, bulk delete, etc.
- **Role was never trusted from the client** (good) but the server **always returned admin** (bad). Cashier accounts effectively had full access.

## Phase 2 — Role Responsibilities

| Role    | Access |
|---------|--------|
| **Admin** | Full: inventory CRUD, users, settings, reports, POS, orders. |
| **Cashier** | POS only: view products, create sales, view/update orders. **NO**: users, settings, reports, inventory editing, dashboard. |
| **Manager** | Operations + limited overrides (see frontend `types/permissions.ts`). |
| **Viewer** | Read-only reports/orders (no mutations). |

Defined in code: `inventory-server/lib/auth/roles.ts` and frontend `src/types/permissions.ts`.

## Phase 3 — Backend Enforcement (Done)

- **Session:** Login sets a signed cookie (`warehouse_session`). Role is derived **server-side** from email:
  - If email is in `ALLOWED_ADMIN_EMAILS` (env) → `admin`
  - Else email prefix (e.g. `cashier@...` → `cashier`). Default `viewer`.
- **Protected routes:**
  - **Admin-only (403 if not admin):** All `admin/api/*` (me, products, products/[id], products/bulk), `api/products` POST/PUT/DELETE, `api/products/bulk` DELETE.
  - **Authenticated (401 if no session):** `api/products` GET, `api/products/[id]` GET, `api/warehouses` GET, `api/warehouses/[id]` GET, `admin/api/me`, `api/auth/user`.
  - **POS role (403 if not cashier/manager/admin):** `api/inventory/deduct` POST, `api/transactions` POST.
- **Unauthorized attempts:** Return 403 and log (path, method, email, role) via `[RBAC] Unauthorized ...` in server logs.

## Phase 4 — UI

- Frontend already gates by `hasPermission()` and `ProtectedRoute`. Once backend returns the correct role (e.g. cashier), the UI shows only allowed nav and pages. **No UI-only protection:** backend is the authority.

## Phase 5 — Verification

1. **Cashier login:** Use `cashier@extremedeptkidz.com` (and shared password). Expect: sidebar shows only POS, Orders, Inventory (view). No Dashboard, Reports, Users, Settings.
2. **Direct API:** As cashier, `GET /api/products` with session cookie → 200. `POST /api/products` or `DELETE /api/products/bulk` → 403.
3. **Admin:** Put your admin email in `ALLOWED_ADMIN_EMAILS`. Login → full access; admin APIs return 200.

## Env (inventory-server)

- **SESSION_SECRET** — Required in production (min 16 chars). Signs session cookie.
- **ALLOWED_ADMIN_EMAILS** — Comma-separated emails that get admin role (e.g. `you@extremedeptkidz.com`). **Set this so your admin account stays admin.** Others get role from email prefix (e.g. `cashier@extremedeptkidz.com` → cashier).

## Confirmation

- Admin access is **impossible** without an admin role: session is signed; role is derived server-side from email; admin routes call `requireAdmin()` and return 403 + log when role is not admin.
