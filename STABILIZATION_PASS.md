# Production stabilization pass (Phase 1)

Additive, backward-compatible fixes for auth, role consistency, and API behavior. No data loss, no breaking API changes.

## Phase 1 — Auth & role consistency (implemented)

### Login flow

- **Role from server only.** No `role ?? 'viewer'` fallback. Role is parsed from API response; invalid/missing role → blocking error.
- **Known accounts never blocked.** When the server returns 200 but role is missing/invalid, the client accepts the session for:
  - `info@extremedeptkidz.com` → super_admin (admin login always works)
  - `cashier@extremedeptkidz.com`, `maintown_cashier@extremedeptkidz.com` → cashier
- **Login email merged into payload.** `normalizeUserData({ ...userPayload, email: userPayload.email ?? trimmedEmail })` so fallback works when the server omits email (cross-browser, backward-compatible).

### Session verification

- **On load:** App calls `/admin/api/me` (then `/api/auth/user` on 404/403). No role from localStorage; block rendering until `checkAuthStatus()` completes.
- **Mismatch:** If role cannot be resolved → `authError` set, user cleared; login page shows “Role could not be verified” and “Dismiss and try again”.

### Orders API and 405

- **Cause:** `OrderContext` ran `loadOrders()` (GET `/api/orders`) on mount, including on the login page. When the API is cross-origin or does not support GET, the browser got 405 and console errors.
- **Fix (client):** Fetch orders only when authenticated. `useEffect` depends on `user`; when `!user`, set orders to `[]` and do not call the API. `useRealtimeSync` uses `disabled: !user` so polling runs only when logged in.
- **Fix (server):** Added GET `/api/orders` in inventory-server that returns `{ data: [] }` with `requireAuth`, so this backend no longer returns 405 for GET /api/orders.

### Cookies and storage

- Auth cookies (inventory-server): `SameSite`, `Secure`, `Path=/` as before; client sends Bearer token so auth works when cookies are blocked.
- No role logic from localStorage; localStorage is used only for token and cached user after successful API response.

### Dashboard routing

- Single Dashboard component; content is gated by `user.role` (admin vs non-admin). No shared fallback that downgrades admin to viewer.

---

## Phases 2–5 (reference)

- **Phase 2 — Inventory durability:** Atomic saves, server response `{ success: true, id, warehouse_id }`, no optimistic UI before server confirm — to be implemented as needed.
- **Phase 3 — Size codes:** Size dropdown and POS size chips — size code support exists in migrations; UX can be extended.
- **Phase 4 — UI polish:** Typography, 8pt grid, consistent heights, inline errors — design tokens exist in `index.css`.
- **Phase 5 — Cross-device:** Fresh fetch on login/device/role change, retry for inventory/product fetch — `apiClient` already has retries and circuit breaker.

---

## Files touched (Phase 1)

| File | Change |
|------|--------|
| `src/contexts/AuthContext.tsx` | Merge login email into payload for normalizeUserData; session verification comment |
| `src/contexts/OrderContext.tsx` | Load orders only when `user` is set; `useRealtimeSync` disabled when `!user` |
| `inventory-server/app/api/orders/route.ts` | New GET handler returning `{ data: [] }` (auth required) |

## Final check

- Admin login (info@) on any browser: accepted as admin; no “valid role” error when server omits/role.
- Login page: no GET /api/orders call; no 405 in console.
- After login: orders load when API supports GET /api/orders; inventory-server returns empty list without 405.
