# Warehouse scope diagnostic — "Could not load warehouse / No warehouse assigned"

## Summary

- **Main Store UUID** `00000000-0000-0000-0000-000000000001` is the real warehouse ID in the DB; it is not a sentinel.
- **WarehouseGuard** shows the error when `useCurrentWarehouse()` ends up with no valid warehouse and either:
  - `loadError` is set (GET `/api/warehouses` failed), or
  - `warehouses.length === 0` so the hook sets `error` to `"No warehouse assigned"`.
- The fix is either **data** (correct `user_scopes` rows) or **code** (query column / Super Admin handling), or both.

---

## STEP 1 — Run these in Supabase SQL Editor (EDK project)

**Required for scope diagnosis:** Query 1 and Query 2. The rest are optional.

### Query 1: What users exist? (required)

```sql
SELECT id, email, raw_user_meta_data
FROM auth.users
ORDER BY email;
```

### Query 2: What rows exist in user_scopes? (required)

```sql
SELECT * FROM user_scopes;
```

### Query 3: Join users and scopes (optional — use this version; table has `user_email`, not `user_id`)

```sql
SELECT
  u.id AS user_id,
  u.email,
  us.warehouse_id,
  w.name AS warehouse_name
FROM auth.users u
LEFT JOIN user_scopes us ON us.user_email = LOWER(TRIM(u.email))
LEFT JOIN warehouses w ON w.id = us.warehouse_id
ORDER BY u.email;
```

### Query 4: What warehouses exist? (optional)

```sql
SELECT * FROM warehouses;
```

### Query 5: user_scopes table definition (optional — only if you need to confirm column names)

The app code queries `user_scopes` by **`user_email`** (see `lib/data/userScopes.ts`). If your table only has **`user_id`**, the lookup will never match.

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_scopes'
ORDER BY ordinal_position;
```

### Query 6: RLS policies on user_scopes (optional)

Backend uses **service role** (bypasses RLS). This is for reference only (e.g. if you add a client-side scope read later).

```sql
SELECT * FROM pg_policies
WHERE tablename = 'user_scopes';
```

---

## STEP 2 — How useCurrentWarehouse and the API behave

### Frontend: no direct DB query

- `useCurrentWarehouse()` does **not** query Supabase. It uses:
  - **Auth:** `auth?.user?.warehouseId` (from GET `/api/auth/user`).
  - **Warehouse list:** `warehouses` from GET `/api/warehouses`.
- “No warehouse assigned” is set when:
  - `!isLoading && !hasValidId && warehouses.length === 0`
- So the error appears when:
  1. **GET /api/warehouses** returns **empty array** `[]`, or
  2. **GET /api/warehouses** fails and `loadError` is set (e.g. “Could not load warehouses”).

Relevant snippet from `WarehouseContext.tsx`:

```ts
const noWarehouseAssigned =
  !isLoading && !hasValidId && warehouses.length === 0 ? 'No warehouse assigned' : null;
return {
  ...
  error: loadError ?? noWarehouseAssigned,
};
```

### Backend: GET /api/warehouses

- Uses `getScopeForUser(auth.email)` from `lib/data/userScopes.ts`.
- **Scope lookup:** `.from('user_scopes').select('warehouse_id, store_id').eq('user_email', trimmed)`.
  - So the code expects a **`user_email`** column (and matches on trimmed lowercased email).
- Logic:
  - If `scope.allowedWarehouseIds.length > 0`: return only warehouses whose `id` is in that list.
  - If user is **admin** or **super_admin** and `scope.allowedWarehouseIds.length === 0` (**isAdminNoScope**): return **all** warehouses (no filter).
  - Otherwise (e.g. cashier with no scope): filter by `scope.allowedWarehouseIds`; if that’s empty, the query uses `.in('id', [])` and returns **no** warehouses.

So for **Super Admin** with **no** `user_scopes` row:

- `getScopeForUser` returns `allowedWarehouseIds: []`.
- **isAdminNoScope** is true → API returns **all** warehouses (so you should **not** see “No warehouse assigned” unless the request fails or the DB has no warehouses).

If you still see the error for Super Admin, then one of these is likely:

1. **Auth role** for that user is not `admin`/`super_admin` in the session the API sees.
2. **GET /api/warehouses** is failing (e.g. 401/500), so the frontend never gets a list and shows load error / no warehouse.
3. **Schema mismatch:** `user_scopes` has no `user_email` (only `user_id`), so the code’s lookup fails and you might rely on env or other path that yields empty list or error.

### Backend: GET /api/auth/user and warehouse_id

- Uses `getSingleWarehouseIdForUser(auth.email)`.
- That uses `getScopeForUser(email)` and returns a warehouse ID **only if** `allowedWarehouseIds.length === 1`.
- So **Super Admin with no user_scopes row** gets **no** `warehouse_id` in the response (by design: multi-warehouse user gets selector). That’s correct; the frontend then relies on the **warehouses list** from GET /api/warehouses and the first/selected warehouse.

---

## STEP 3 — Likely fixes (after you have query results)

### FIX A — user_scopes has user_id but code uses user_email

- Either:
  - Add a **`user_email`** column to `user_scopes` and keep it in sync with `auth.users` (e.g. trigger or on insert/update), and keep using `getScopeForUser(email)`, or
  - Change the backend to resolve **email → user id** (e.g. from `auth.users`) and query `user_scopes` by **`user_id`** instead of `user_email`.

### FIX B — Missing user_scopes row(s)

If Query 2/3 show no row for the Super Admin (or for users who should see Main Store), insert one (adjust column names if your table uses `user_id` only):

```sql
-- If user_scopes has user_email and warehouse_id (and optionally user_id):
INSERT INTO user_scopes (user_email, warehouse_id)
VALUES (
  LOWER(TRIM((SELECT email FROM auth.users WHERE email = 'info@yourdomain.com'))),
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (user_email) DO NOTHING;  -- only if you have a unique on user_email

-- If user_scopes has user_id and warehouse_id:
INSERT INTO user_scopes (user_id, warehouse_id)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'info@yourdomain.com' LIMIT 1),
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (user_id) DO NOTHING;  -- only if you have a unique on user_id
```

Repeat for every user who should have access to Main Store. Show the exact SQL (and schema) before running.

### FIX C — Super Admin with no user_scopes: ensure warehouses list is still returned

- Backend already treats **admin/super_admin + empty scope** as “return all warehouses” (isAdminNoScope).
- If the error persists, confirm that the session role is really `admin` or `super_admin` in `requireAuth` (and that GET /api/warehouses is not 401/500). If the role is wrong, fix how the role is set (e.g. from `auth.users.raw_user_meta_data` or your roles table).

### FIX D — RLS on user_scopes (only if client reads user_scopes)

- Backend uses **service role**, so RLS does not affect it. If you add a client-side path that reads `user_scopes`, then you need a policy, e.g.:

```sql
CREATE POLICY "Users can read own scope"
ON user_scopes FOR SELECT
USING (auth.uid() = user_id);
```

(Adjust to `user_email` if you use that for matching.)

---

## Constraint

- Do **not** change how warehouse IDs work: `00000000-0000-0000-0000-000000000001` is the real Main Store UUID and must stay as-is.
- Fix by ensuring **user_scopes** has the right data and that the backend can read it (correct column: `user_email` or `user_id`), and that GET /api/warehouses and GET /api/auth/user behave as above.

---

## Success criteria after fix

- [ ] `useCurrentWarehouse()` returns `warehouseId: "00000000-0000-0000-0000-000000000001"` (or selected warehouse).
- [ ] WarehouseGuard passes through (no error screen).
- [ ] Dashboard loads with Main Store data.
- [ ] Inventory loads all products.
- [ ] POS loads all products.
- [ ] Adding to cart works.
- [ ] Sale completes successfully.

Run the diagnostic queries, paste the results, then we can choose the exact fix (data and/or code).

---

## Diagnostic results (2025-03)

- **auth.users:** 4 users (Admin@, cashier@, info@, maintown_cashier@).
- **user_scopes:** Table has `user_email` (no `user_id`). Rows: cashier@ → Main Store; maintown_cashier@ → Main Town; **info@ → 2 rows** (Main Store + Main Town). **Admin@ has no row.**
- So for **info@**: `getScopeForUser` returns 2 warehouse IDs → GET /api/warehouses returns both warehouses (no "No warehouse assigned" from empty list).
- For **Admin@**: no scope → if session role is not `admin`/`super_admin`, GET /api/warehouses filters by `.in('id', [])` → **empty list** → "No warehouse assigned".

- **info@** = Super Admin; has 2 scope rows (Main Store + Main Town). Backend should return both warehouses; no data fix needed for this user.
- **Admin@** = not set up yet; can add a `user_scopes` row later when needed.

If **info@** still sees "Could not load warehouse / No warehouse assigned", the cause is not missing scope data. Check:
1. **Network tab** (logged in as info@): GET `/api/warehouses` — status 200 and body `[{ id: "...", name: "Main Store" }, ...]`? If 401/500 or empty body, fix auth or API (token, `VITE_API_BASE_URL`, backend env).
2. **Auth** — is `Authorization: Bearer <token>` sent on the request?
