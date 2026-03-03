# Architecture & Product Roadmap

**Role:** Senior software engineer & product architect.  
**Purpose:** Single source of truth for system shape, product scope, and recommended priorities.

---

## Current state (at a glance)

- **Production-ready:** Auth (login/logout/session), products (CRUD, list with scope), dashboard, size-codes, sales (record, list, void). All in-repo and wired to Supabase. Frontend uses React Query, circuit breaker, and cache; first product page 100 items; scope cached 30s on API.
- **Docs:** CONNECT (runbook), ENGINEERING_RULES (commit/migrations), SUPABASE_VERCEL_SPEED_AND_RELIABILITY (speed/uptime), this doc (architecture + roadmap).
- **Next:** Phase 3 health extension optional; Phase 4 offline sync and mobile parity polish.

---

## 1. Product vision and scope

**Warehouse POS** is a warehouse-scoped inventory and point-of-sale system:

- **Inventory:** Per-warehouse product list, CRUD, stock by size, images (Supabase storage).
- **POS:** Session-based sales flow (cart → charge → record sale); optional offline queue and sync.
- **Sales & reports:** Sales history, revenue summary, CSV export; dashboard KPIs by warehouse/date.
- **RBAC:** Roles (Super Admin, Admin, Manager, Cashier, Warehouse, Driver, Viewer) with permission-gated UI; backend is the authority.
- **Multi-tenant:** Warehouse/location selection; data scoped by `warehouse_id` and (where applicable) user scope.

**Out of scope (current):** E‑commerce storefront, multi-currency, native mobile apps. PWA/offline is in scope as an enhancement.

---

## 2. Current architecture

### 2.1 High-level

```
[ Browser / PWA ]
       │
       │ VITE_API_BASE_URL (e.g. https://api.example.com or localhost:3001)
       ▼
[ Inventory API (Next.js) ]  ← CORS, Auth (Bearer / cookies)
       │
       │ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
       ▼
[ Supabase (Postgres + optional Storage) ]
```

- **Frontend:** Vite + React 18, React Router, TanStack Query, Dexie (offline). Single SPA; routes: `/`, `/inventory`, `/orders`, `/pos`, `/sales`, `/deliveries`, `/reports`, `/users`, `/settings`. Nav and permissions from `src/config/navigation.tsx` and `src/types/permissions.ts`.
- **API:** Next.js 14 App Router in `inventory-server/`. Middleware handles CORS and (where implemented) auth. Reads/writes Supabase via service-role client in `lib/supabase/admin.ts`.
- **Data ownership:** Backend and Supabase are source of truth. Frontend cache (localStorage, IndexedDB) is for UX and offline; no “saved” without confirmed 2xx from API.

### 2.2 API surface (inventory-server)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/health` | GET | Liveness + DB check | ✅ Implemented |
| `/api/products` | GET, POST, PUT, DELETE | Products by warehouse, CRUD | ✅ Implemented |
| `/api/dashboard` | GET | KPIs by warehouse/date | ✅ Implemented |
| `/api/size-codes` | GET | Size code list for UI | ✅ Implemented |
| `/api/sales` | GET, POST | Sales list, record sale | ✅ Implemented |
| `/api/sales/void` | POST | Void transaction | ✅ Implemented |
| `/admin/api/me`, `/api/auth/user` | GET | Session / current user | ✅ Implemented |
| `/admin/api/login`, `/api/auth/login` | POST | Login | ✅ Implemented |
| `/admin/api/logout`, `/api/auth/logout` | POST | Logout | ✅ Implemented |

**Auth:** Login validates credentials via `lib/auth/credentials.ts` (env: `ALLOWED_ADMIN_EMAILS`, `POS_PASSWORD_CASHIER_MAIN_STORE`, `POS_PASSWORD_MAIN_TOWN`; optional `ADMIN_PASSWORD`). Session is JWT (Bearer or cookie); `lib/auth/session.ts` provides `requireAuth` / `requirePosRole`. **Sales:** POST calls Supabase RPC `record_sale` with `sold_by_email` from auth; GET lists sales with lines; void updates `sales.status` to `voided`.

### 2.3 Data flow (inventory)

- **Read:** `InventoryContext` → `loadProducts()` → `GET /api/products?warehouse_id=...` → `setProducts()`. Optional: mirror to Dexie when offline-enabled; cache in localStorage for instant re-display.
- **Write:** Add/update/delete → `apiPost` / `apiPut` / `apiDelete` to same API → optimistic UI with server confirmation; no “saved” without 2xx.
- **Offline (feature-flagged):** When `VITE_OFFLINE_ENABLED` is true, `useInventory` (Dexie) can add/update locally and `syncService` pushes to `/api/products` when online. Conflict handling and queue visibility are in `SyncQueueModal` / `SyncStatusBar`.

### 2.4 Auth and RBAC (intended model)

- **Backend is authority:** Role and permissions come from the server (e.g. `/api/auth/user` or `/admin/api/me`). Frontend only gates UI; never trust client for role.
- **Frontend:** `AuthContext` holds user, role, permissions; `ProtectedRoute` and nav items use `PERMISSIONS` from `src/types/permissions.ts`. Login flow calls `API_BASE_URL/admin/api/login` or `api/auth/login`; session refresh uses `/me` or `/api/auth/user`.
- **API (when implemented):** Validate Bearer token or session cookie; resolve user and warehouse scope; enforce RLS or application-level checks in Supabase.

### 2.5 Database and migrations

- **Migrations:** All under `inventory-server/supabase/migrations/` (timestamped). Apply via Supabase CLI or dashboard. No schema changes without a migration committed with the code that uses it (see ENGINEERING_RULES).
- **Order and descriptions:** See **`docs/MIGRATIONS.md`** for chronological list and one-line descriptions. New environments: run all timestamped migrations in order; existing projects: apply only migrations after your last applied one.

---

## 3. Security and operations

- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, POS passwords — env only; never in repo. Use Vercel (or host) env for API.
- **CORS:** Middleware allows configured origins and suffixes; credentials supported. Set `CORS_ORIGINS` or `FRONTEND_ORIGIN` in production.
- **HTTPS:** Enforce in production for frontend and API.

---

## 4. Priorities and roadmap (senior-engineer view)

### Phase 1 — Stabilize and document (done)

- [x] **Document API surface:** Auth and sales are implemented in this repo; no external auth/sales URL. See API table in §2.2.
- [x] **Base schema:** `docs/MIGRATIONS.md` documents migration order and descriptions; new environments run all timestamped migrations in order.
- [x] **Connect playbook:** `docs/CONNECT.md` for onboarding; ENGINEERING_RULES and this doc in sync.

### Phase 2 — Complete API surface (done)

- [x] **Auth in inventory-server:** Implemented `/api/auth/login`, `/api/auth/logout`, `/api/auth/user` and `/admin/api/login`, `/admin/api/me`, `/admin/api/logout`. Credentials validated via `lib/auth/credentials.ts` (env: `ALLOWED_ADMIN_EMAILS`, `POS_PASSWORD_*`, optional `ADMIN_PASSWORD`). Session JWT from `lib/auth/session.ts`; `getSingleWarehouseIdForUser` enriches cashier warehouse.
- [x] **Sales in inventory-server:** Implemented `GET /api/sales` (list with lines, filter by warehouse_id/from/limit), `POST /api/sales` (record_sale RPC, sold_by_email from auth), `POST /api/sales/void` (set status = 'voided').

### Phase 3 — Observability and reliability

- [x] **Error shape and requestId:** `lib/apiResponse.ts` provides `getRequestId(req)`, `jsonError(status, message, { code, requestId, headers })`, `jsonErrorBody()`. GET /api/products uses it for 500/503/504; extend to other routes as needed.
- [x] **Structured logging:** `lib/requestLog.ts` logs 4xx/5xx and slow requests (>2s) with requestId; used in GET/POST /api/products and GET /api/sales. One-line JSON for log aggregators.
- [ ] **Health:** Keep `/api/health`; extend if needed (e.g. queue depth, Supabase latency).

### Phase 4 — Product and performance

- [ ] **Offline sync:** Harden conflict resolution and sync queue UI; optional “last synced” and retry policy.
- [ ] **Mobile parity:** Nav from single config (done); cache headers and SW update flow (see ENGINEERING_RULES §8).
- [ ] **Performance:** Products list and dashboard already use indexes; monitor N+1 and add pagination/cursor where needed.

---

## 5. Principles (decision log)

| Principle | Rationale |
|-----------|-----------|
| Backend is source of truth | Avoid split brain; single place for RBAC and data validation. |
| No “saved” without 2xx | Data durability and clear UX; offline path is explicit (sync queue). |
| One nav config | Sidebar and MobileMenu import from `navigation.tsx`; no nav drift (ENGINEERING_RULES §8). |
| Migrations with code | Schema and code that use it ship together; no orphan migrations. |
| Commit at feature boundaries | Reduces lost work; guard script and CI enforce discipline. |

---

## 6. Where to look

| Need | Location |
|------|----------|
| Run / connect | `docs/CONNECT.md` |
| Migrations (order, descriptions, new env) | `docs/MIGRATIONS.md` |
| Ship checklist (before release / handoff) | `docs/SHIP_CHECKLIST.md` |
| Cursor ↔ Supabase ↔ Vercel (MCP/plugins) | `docs/CURSOR_SUPABASE_VERCEL_MCP.md` |
| Speed & reliability (Supabase + Vercel) | `docs/SUPABASE_VERCEL_SPEED_AND_RELIABILITY.md` |
| Commit, push, migrations | `docs/ENGINEERING_RULES.md` |
| Env (API) | `inventory-server/ENV_SETUP.md`, `.env.local.example` |
| Env (frontend) | `.env.example` |
| API error shape (requestId, code) | `inventory-server/lib/apiResponse.ts` |
| Request logging (4xx/5xx, slow) | `inventory-server/lib/requestLog.ts` |
| RBAC permissions | `src/types/permissions.ts` |
| Nav (desktop + mobile) | `src/config/navigation.tsx` |
| Inventory lifecycle | `src/contexts/InventoryContext.tsx` (file header) |
| Offline sync | `src/services/syncService.js`, `src/hooks/useInventory.js` |
| CI | `.github/workflows/ci.yml` |

---

*Document owned by engineering. Update when API surface, auth, or roadmap changes.*
