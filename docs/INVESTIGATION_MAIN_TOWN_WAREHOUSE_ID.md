# Investigation — Why Does a Main Town User Get Warehouse ID 001?

**Goal:** Find why a user scoped to Main Town receives Main Store's warehouse ID (001) from auth/scope resolution.  
**Run the SQL below in Supabase SQL editor and paste results.** The code paths below show exactly where warehouse ID is set.

---

## RESULTS & ROOT CAUSE (confirmed from SQL)

**Query 2–5 results show:**

| User | user_scopes | getScopeForUser returns |
|------|-------------|--------------------------|
| **maintown_cashier@** (Main Town cashier/POS) | 1 row → Main Town (312ee60a...) | `allowedWarehouseIds = [312ee60a...]` ✓ correct |
| **cashier@** | 1 row → Main Store (001) | `[001]` ✓ correct |
| **info@** | 2 rows → Main Store + Main Town | `[001, 312ee60a...]` (order from DB) |
| **Admin@** | no row | null → fallback to ALLOWED_WAREHOUSE_IDS or empty |

So **user_scopes data is correct** for Main Town. maintown_cashier is scoped only to Main Town. The bug is **not** wrong data in user_scopes (not Hypothesis A).

**Root cause:** The frontend never receives **warehouse_id** for the logged-in user.

- **GET /api/auth/user** does not exist in this repo (or does not return `warehouse_id` from user_scopes).
- So for maintown_cashier: `user.warehouseId` stays **undefined** → **boundWarehouseId** in WarehouseContext is undefined.
- WarehouseContext then sets **currentWarehouseId** from: (1) localStorage `warehouse_current_id`, or (2) first warehouse from GET /api/warehouses. Main Store (001) was created first and likely comes first in the list → **deduped[0].id = 001**.
- Result: Main Town user sees Main Store’s ID (001) and the sentinel logic fires (id = 001, name = “Main Town” from the list? No — the list has 001 = “Main Store”. So the dropdown might show “Main Store” and they’re actually seeing Main Store data. If the UI shows “Main Town” it could be from a different code path.) In any case, the fix is: **return warehouse_id from the server** so boundWarehouseId is set.

**Fix (Phase 3 first action) — DONE:**

1. **GET /api/auth/user** (`inventory-server/app/api/auth/user/route.ts`) already existed; it was updated to:
   - Resolve **warehouse_id** from session (JWT) or from user_scopes: getSingleWarehouseIdForUser (single-warehouse users) or getScopeForUser().allowedWarehouseIds[0] (multi-warehouse).
   - Return **warehouse_id** in the JSON so the frontend sets boundWarehouseId.
   - Send **Cache-Control: private, no-store** so the response is not cached.
2. **POST /api/auth/login** (and re-exported **POST /admin/api/login**) was updated to:
   - Resolve warehouse_id the same way (single or first in scope) and include it in the login response and in the session JWT binding.
3. With this, the frontend receives warehouse_id on both login and GET /api/auth/user. Main Town user gets 312ee60a..., and boundWarehouseId is set so no fallback to first warehouse (001).

**If the issue persists:** Confirm VITE_API_BASE_URL (or API_BASE_URL) points to the deployed inventory-server that serves these routes. Clear session (logout, clear cookies/localStorage) and log in again as maintown_cashier@ so the new response is used.

**Optional:** Add a user_scopes row for admin@extremedeptkidz.com if they should have a default warehouse.

---

## SQL to run (Supabase SQL editor)

Run these in order and record all results:

```sql
-- 1. Confirm both warehouses exist with real IDs
SELECT id, name, created_at
FROM warehouses
ORDER BY created_at;
-- CONFIRMED: Main Store = 001, Main Town = 312ee60a-9bcb-4a5f-b6ae-59393f716867

-- 2. user_scopes has user_email (NOT user_id). List all scopes with warehouse names:
SELECT 
  us.user_email,
  us.warehouse_id,
  w.name as warehouse_name
FROM user_scopes us
JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY w.name, us.user_email;

-- 3. Match auth.users to user_scopes by email (how getScopeForUser resolves):
SELECT 
  u.email as auth_email,
  LOWER(TRIM(u.email)) as email_normalized,
  us.user_email as scope_user_email,
  us.warehouse_id,
  w.name as warehouse_name
FROM auth.users u
LEFT JOIN user_scopes us ON LOWER(TRIM(us.user_email)) = LOWER(TRIM(u.email))
LEFT JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY u.email;

-- 4. Any user_email scoped to more than one warehouse?
SELECT 
  user_email,
  COUNT(*) as scope_count,
  array_agg(warehouse_id) as warehouse_ids
FROM user_scopes
GROUP BY user_email
HAVING COUNT(*) > 1;

-- 5. Is 001 in warehouses? (sanity check)
SELECT id, name FROM warehouses
WHERE id = '00000000-0000-0000-0000-000000000001';
```

---

## Code path 1 — Server: getScopeForUser (user_scopes)

**File:** `inventory-server/lib/data/userScopes.ts`

- **Key:** Queries by **user_email** (trimmed, lowercase). Table must have `user_email` or the query returns no rows.
- **Fallback:** If no rows or query fails → uses **env `ALLOWED_WAREHOUSE_IDS`**. If that env is `00000000-0000-0000-0000-000000000001`, every user without a scope gets Main Store (001). **This is Hypothesis C.**

```ts
export async function getScopeForUser(email: string): Promise<UserScope> {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return EMPTY_SCOPE;

  const cached = getScopeFromCache(trimmed);
  if (cached) return cached;

  try {
    const db = getSupabase();
    const { data: rows, error } = await db
      .from('user_scopes')
      .select('warehouse_id, store_id')
      .eq('user_email', trimmed)   // <-- MUST match column and casing
      .not('warehouse_id', 'is', null);

    if (!error && Array.isArray(rows) && rows.length > 0) {
      const warehouseIds = [...new Set((rows as { warehouse_id: string }[]).map((r) => String(r.warehouse_id)).filter(Boolean))];
      // ...
      return scope;
    }
  } catch {
    /* table missing or query failed; fallback to env */
  }

  const raw = process.env.ALLOWED_WAREHOUSE_IDS?.trim();  // <-- FALLBACK
  if (!raw) return EMPTY_SCOPE;
  const allowedWarehouseIds = raw.split(',').map((id) => id.trim()).filter(Boolean);
  const scope = { ...EMPTY_SCOPE, allowedWarehouseIds };
  setScopeCache(trimmed, scope);
  return scope;
}
```

---

## Code path 2 — Server: session auth (warehouse_id in JWT only)

**File:** `inventory-server/lib/auth/session.ts`

- **Supabase JWT path:** Returns only `{ email, role }` — **no warehouse_id**.
- **App session JWT path:** Returns `warehouse_id` from payload if present (set at login via SessionBinding).
- So for the frontend to get warehouse_id when using Supabase auth, **some route** (e.g. GET /api/auth/user) must call getScopeForUser / getSingleWarehouseIdForUser and add warehouse_id to the response. That route is **not in this repo**; it may live in another service or need to be added.

```ts
// When Supabase JWT is used:
if (!error && user?.email) {
  const role = resolveRole(user.email, user.user_metadata);
  return { email: user.email, role };  // NO warehouse_id
}

// When app session JWT is used (e.g. after login that set binding):
return {
  email,
  role,
  warehouse_id: typeof payload.warehouse_id === 'string' ? payload.warehouse_id : undefined,
};
```

```ts
/** JSON payload for frontend (e.g. GET /api/auth/user). */
export function sessionUserToJson(auth: Session): { email: string; role: string; warehouse_id?: string } {
  const out = { email: auth.email, role: auth.role };
  if (auth.warehouse_id) out.warehouse_id = auth.warehouse_id;
  return out;
}
```

---

## Code path 3 — /api/auth/user route

**Status:** There is **no** `app/api/auth/user/route.ts` (or equivalent) in `inventory-server` in this repo. The frontend calls `GET ${API_BASE_URL}/api/auth/user` and expects `{ email, role, warehouse_id?, ... }`. So either:

- The route is implemented in another codebase that shares API_BASE_URL, or  
- It needs to be implemented here: requireAuth → getSession → getScopeForUser(session.email) → getSingleWarehouseIdForUser or allowed[0] → return { ...sessionUserToJson(session), warehouse_id: singleOrFirst }.

If the live backend returns warehouse_id from somewhere other than user_scopes (e.g. hardcoded 001 or auth.users.raw_user_meta_data), that would explain Main Town getting 001 (**Hypothesis B**).

---

## Code path 4 — AuthContext: how warehouseId is set after login

**File:** `src/contexts/AuthContext.tsx`

- **Login:** `normalizedUser.warehouseId = userData.warehouse_id ?? userData.warehouseId` from login response.
- **checkAuthStatus / tryRefreshSession:** Calls GET `/api/auth/user`; then `normalizedUser.warehouseId = userData.warehouse_id ?? userData.warehouseId`. For cashier, if warehouseId is missing, it fetches `/api/auth/user` again and sets `warehouseId` from that response.

So the frontend **never** reads user_scopes directly. It only ever gets warehouse_id from:

1. Login API response (body.warehouse_id / body.warehouseId), or  
2. GET /api/auth/user response (warehouse_id / warehouseId).

So the bug is either: (A) user_scopes has wrong warehouse_id for Main Town user, (B) login or /api/auth/user returns 001 (e.g. from metadata or fallback), (C) getScopeForUser returns empty → ALLOWED_WAREHOUSE_IDS fallback = 001, (D) WarehouseContext default, (E) stale JWT/session.

---

## Code path 5 — WarehouseContext: how warehouse is resolved

**File:** `src/contexts/WarehouseContext.tsx`

- **boundWarehouseId** = `auth?.user?.warehouseId` (from AuthContext — i.e. from login or /api/auth/user).
- **Initial state:** `currentWarehouseId` from localStorage `warehouse_current_id`, or ''.
- **After refreshWarehouses():**  
  - If `boundWarehouseId` is in the list → use it.  
  - Else if previous `currentWarehouseId` is still in list → keep it.  
  - Else → **deduped[0].id** (first warehouse from GET /api/warehouses).

So if boundWarehouseId is wrong (001), the UI shows 001. If boundWarehouseId is missing and localStorage or first warehouse is Main Store (001), again the UI shows 001. **Hypothesis D** is: no bound → we default to first warehouse; if /api/warehouses returns Main Store first, that’s 001. So the root cause can still be that the backend never sent Main Town’s UUID (getScopeForUser fallback or wrong scope row).

---

## Hypothesis summary

| Hyp | Description | Where to fix |
|-----|-------------|--------------|
| **A** | user_scopes has warehouse_id = 001 for Main Town user | DB: UPDATE user_scopes SET warehouse_id = '[MAIN_TOWN_UUID]' WHERE ... |
| **B** | Auth metadata or login/response returns 001 | Stop reading warehouse from metadata; ensure login and /api/auth/user use getScopeForUser only |
| **C** | getScopeForUser finds no scope → ALLOWED_WAREHOUSE_IDS = 001 | Add Main Town user to user_scopes; remove or narrow ALLOWED_WAREHOUSE_IDS fallback |
| **D** | WarehouseContext defaults to first warehouse (001) | Only relevant if bound is missing; fix bound first (A/B/C) |
| **E** | Stale JWT/session with 001 | Clear session, re-login; ensure login uses getScopeForUser and puts correct warehouse_id in JWT |

**Most likely:** **C** (no user_scopes row for Main Town user, or user_email mismatch, so fallback to env 001) or **A** (wrong warehouse_id in user_scopes). SQL results will tell.

---

## user_scopes table note

The code uses **user_email** (lowercase). Your schema might use **user_id** (UUID). If the table has only user_id, getScopeForUser will always get no rows (unless you add user_email). So either:

- Add and populate `user_email` on user_scopes and keep using it, or  
- Change getScopeForUser to accept user id and query by user_id (and have /api/auth/user pass user id from Supabase auth).

Run the SQL and paste results so we can confirm which hypothesis holds.

---

## Appendix — Exact code (full)

### A. inventory-server/lib/auth/session.ts (requireAuth + getSession + sessionUserToJson)

- **requireAuthAsync:** Supabase JWT → `{ email, role }` (no warehouse_id). App JWT → `{ email, role, warehouse_id? }` from payload.
- **getSession:** Same two paths; returns Session or null. Used by any route that needs current user without 401.
- **sessionUserToJson(auth):** Returns `{ email, role, warehouse_id? }` for frontend. So warehouse_id only present if it was in the session (e.g. JWT payload).

Full file is at `inventory-server/lib/auth/session.ts` (285 lines). Key: **warehouse_id is only set when the token payload contains it** (app login flow). Supabase path never adds it; so GET /api/auth/user must add it server-side using getScopeForUser if that route lives here.

### B. getScopeForUser — defined in inventory-server/lib/data/userScopes.ts

Full file at `inventory-server/lib/data/userScopes.ts`. See Code path 1 above for the exact function. Critical: **.eq('user_email', trimmed)** and **fallback to process.env.ALLOWED_WAREHOUSE_IDS**.

### C. /api/auth/user route

**Not present in this repo.** The frontend calls `GET ${API_BASE_URL}/api/auth/user`. There is no `app/api/auth/user/route.ts` (or similar) under inventory-server. So either another service serves it or it must be added. To implement: requireAuth → getScopeForUser(session.email) → getSingleWarehouseIdForUser or allowed[0] → return { email, role, warehouse_id }.

### D. AuthContext — how warehouseId is set

- **normalizeUserData:** `warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined`
- **checkAuthStatus:** Fetches `/api/auth/user`; then for cashier without warehouseId, fetches again and sets `normalizedUser.warehouseId = enrichedData.warehouse_id ?? enrichedData.warehouseId`
- **login:** Same: payload from login response → normalizeUserData → warehouseId from payload

So **every** warehouseId on the client comes from an API response (login or /api/auth/user). There is no client-side scope lookup.

### E. WarehouseContext — how warehouse is resolved

- **boundWarehouseId** = `auth?.user?.warehouseId?.trim() || undefined`
- **currentWarehouseId (state)** = init from localStorage `warehouse_current_id`, or ''
- **refreshWarehouses:** GET /api/warehouses → then setState:
  - If boundWarehouseId is in list → use boundWarehouseId
  - Else if prev currentWarehouseId is in list → keep prev
  - Else → **deduped[0].id** (first warehouse)
- **Exposed value:** `currentWarehouseId: effectiveWarehouseId` where **effectiveWarehouseId = boundWarehouseId || currentWarehouseId**

So if auth gives wrong warehouseId (001), the whole app shows 001. If auth gives no warehouseId and localStorage or first warehouse is 001, again 001. Root cause is upstream: auth/scope must return the correct UUID for Main Town.
