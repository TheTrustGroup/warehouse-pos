# Stabilization Phases 1–6 — Final Checklist

Additive, production-safe fixes. No redesign; no regression in POS performance.

## Final stability outcomes (after all phases)

| Outcome | How it’s ensured |
|--------|-------------------|
| **Safari = Brave = Chrome UI identical** | Content-hashed assets (Vite); HTML not cached (meta + SW NetworkOnly); build version logged on start; single API base URL. |
| **No stale builds** | JS/CSS `[hash]`; SW caches static only, CACHE_VERSION bump on deploy; HTML always from network. |
| **Inventory opens without flashing** | List state never cleared before fetch; skeleton when no products; when products exist, list stays visible with “Updating…” bar. |
| **No layout jumping** | 100dvh viewport; stable min-height on list container and table rows; grid cards min-h; no layout-shifting animations on inventory grid. |
| **New product appears instantly** | Optimistic add: temp row with `_pending`, then replace with server response on success. |
| **No data loss if save fails** | On API failure: temp removed, error toast, no silent keep. |
| **No duplicate products** | Single temp id; replace-by-id on success; no full refetch after add. |
| **No role downgrade** | Role from server only; no `role ?? 'viewer'`; invalid role → authError, redirect to login. |
| **No transparent form overlap** | Modals/overlays use `.solid-overlay` / `.solid-panel` (no backdrop-filter on forms/dropdowns/drawers). |

---

## Phase 1 — Cross-browser & session

- **Build/cache:** Content hashing (Vite); HTML no-cache meta; SW: document → NetworkOnly, static only, CACHE_VERSION.
- **Session/role:** On load call auth/me; block dashboard until role confirmed; no UI fallback for role; invalid role → force logout.
- **Files:** `index.html`, `vite.config.ts`, `main.tsx`, `public/service-worker.js`, `App.tsx`, `AuthContext.tsx`, `Sidebar.tsx`, `MobileMenu.tsx`.

## Phase 2 — Stop inventory flashing

- **List:** Never clear products before fetch; keep previous list visible while loading; skeleton when no products; stable container min-height.
- **Files:** `Inventory.tsx`, `InventoryListSkeleton.tsx` (new), `InventoryContext.tsx` (no setProducts([])).

## Phase 3 — Remove UI jitter

- **Layout:** 100dvh viewport (fallback 100vh); table-row min-height; grid card min-height; stable animations (no y/scale) on inventory grid.
- **Overlays:** Solid backgrounds (no backdrop-filter on interactive surfaces); z-index and click-through fixed.
- **Files:** `index.css`, `glassmorphism.css`, `ProductGridView.tsx`, `LoadingSpinner.tsx`, `ProductFormModal.tsx`.

## Phase 4 — Optimistic product creation

- **Add product:** Insert temp with `_pending`; on success replace with server item; on failure remove temp and show error; save button disabled during request; no full refetch after save.
- **Files:** `InventoryContext.tsx`, `ProductFormModal.tsx`, `ProductTableView.tsx`, `ProductGridView.tsx`, `types/index.ts`.

## Phase 5 — API hardening

- **Centralized URL:** All calls use `API_BASE_URL` from `lib/api.ts`; no hardcoded production domains.
- **Timeouts & retry:** Request timeout in apiClient; retry GET only (never POST/PUT/DELETE).
- **Server unreachable:** Circuit breaker; degraded banner; write actions disabled; no false “saved” (optimistic temp removed on failure).
- **Files:** `lib/api.ts`, `lib/apiClient.ts`, `InventoryContext.tsx` (circuit check before insert).

## Phase 6 — Final pass

- **Docs:** This file; stability comments in critical files.
- **Cleanup:** No dead code left in modified components; no removal of CSS used by demo (e.g. LiquidGlassShowcase).
- **No redesign:** Only stabilization comments and doc updates.
- **POS:** No changes to POS flow or performance.

---

## Critical stability comments (in code)

- **`index.css`:** Viewport uses 100dvh (Safari-safe); table-row min-height prevents list collapse.
- **`App.tsx` ProtectedRoutes:** authError and user-null block dashboard; role from server only.
- **`InventoryContext.tsx` addProduct:** Optimistic temp → replace on success, remove on failure; circuit check before insert; no full refetch after add.
- **`Inventory.tsx`:** Stable list min-height; keep list visible when loading; skeleton when no products.
- **`main.tsx`:** Build version logged for cross-browser consistency check.
- **`public/service-worker.js`:** HTML/document never cached (NetworkOnly); static assets only.
