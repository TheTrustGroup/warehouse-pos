# STEP 1 — NULL WAREHOUSE ID SOURCE (Findings)

## 1. Where the placeholder UUID appears

### Hardcoded placeholder

| File | Line | What |
|------|------|------|
| **`src/contexts/WarehouseContext.tsx`** | **26** | **`export const DEFAULT_WAREHOUSE_ID = '00000000-0000-0000-0000-000000000001';`** — **ROOT SOURCE** |
| **`src/contexts/WarehouseContext.tsx`** | **66–72** | Initial state: `useState<string>(() => { ... return DEFAULT_WAREHOUSE_ID; })` when localStorage is empty or invalid |
| **`src/pages/SalesHistoryPage.tsx`** | **308–310** | `FALLBACK_WAREHOUSES = [{ id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' }, { id: '...0002', name: 'Main Town' }]` — used when `contextWarehouses.length === 0` |

### Where `warehouse_id` can be null/undefined and falls back

| File | Line | Code | Fallback behavior |
|------|------|------|-------------------|
| **WarehouseContext.tsx** | 135–147 | `effectiveWarehouseId = boundWarehouseId \|\| currentWarehouseId`; context exposes `currentWarehouseId: effectiveWarehouseId` | Before warehouses load, `currentWarehouseId` is the **placeholder** (initial state). So `effectiveWarehouseId` is the placeholder until auth/API provides a real ID. |
| **DashboardPage.tsx** | 134 | `warehouseId = currentWarehouseId ?? ''` | If context ever gave null we’d send `''`; in practice context gives the **placeholder** string so we send the placeholder. |
| **useDashboardQuery.ts** | 82 | `enabled: Boolean(warehouseId?.trim())` | Placeholder is non-empty → query **runs** with placeholder → 503/504. |
| **POSPage.tsx** | 141–145 | `warehouse = currentWarehouse ?? { id: currentWarehouseId, name: 'Loading...', code: '' }` | When `currentWarehouse` is null (warehouses not loaded), `warehouse.id` = **currentWarehouseId** = placeholder. |
| **POSPage.tsx** | 926 | `warehouseId={warehouse?.id ?? currentWarehouseId ?? warehouses[0]?.id ?? ''}` | CartSheet gets placeholder when context hasn’t loaded real warehouses. |
| **SalesHistoryPage.tsx** | 319, 323 | `warehouses = contextWarehouses.length > 0 ? contextWarehouses : FALLBACK_WAREHOUSES`; `warehouseId = currentWarehouseId \|\| warehouses[0].id` | When context empty, uses FALLBACK_WAREHOUSES; initial selection can be **placeholder** from `warehouses[0].id`. |
| **DeliveriesPage.tsx** | 264 | `warehouseId = propWarehouseId \|\| currentWarehouseId \|\| ''` | Can send placeholder if that’s what context has. |
| **Reports.tsx** | 141, 150 | Guard `!currentWarehouseId`; then `warehouseId: currentWarehouseId` | Skips fetch if no ID; when it does fetch, uses whatever context has (could be placeholder if race). |
| **AuthContext.tsx** | 99, 124, 215, 356, 617 | `warehouseId: userData.warehouse_id ?? userData.warehouseId ?? undefined` | User’s bound warehouse from API; no placeholder here. |
| **inventory-server** routes | various | `searchParams.get('warehouse_id')?.trim() ?? ''` | Server receives whatever the client sent (including placeholder). |

---

## 2. Warehouse context / hook

**File:** `src/contexts/WarehouseContext.tsx`

### How current warehouse is loaded

1. **Initial state (lines 66–72)**  
   - `currentWarehouseId` is initialized from `localStorage.getItem(STORAGE_KEY)` if valid.  
   - If missing or equal to `'00000000-0000-0000-0000-000000000000'`, it defaults to **`DEFAULT_WAREHOUSE_ID`** (`'00000000-0000-0000-0000-000000000001'`).

2. **After auth is ready (lines 105–112)**  
   - When `!authLoading` and `isAuthenticated`, `refreshWarehouses()` runs.  
   - It calls `GET /api/warehouses`, then:  
     - Sets `warehouses` from API.  
     - If list is non-empty, updates `currentWarehouseId` to: bound warehouse if valid, else previous if still in list, else `deduped[0].id` (first real warehouse).  
   - So **only after** this does `currentWarehouseId` become a real ID (or stay a real ID from localStorage).

3. **Bound warehouse (lines 115–119, 135)**  
   - If user has `auth?.user?.warehouseId` (cashier), `effectiveWarehouseId = boundWarehouseId || currentWarehouseId`.  
   - So for cashiers, once auth has loaded, the effective ID can come from the user.  
   - **Before** auth/warehouses load, `boundWarehouseId` is undefined and `currentWarehouseId` is the **placeholder**.

### Initial state before load

- **Before** `refreshWarehouses()` (and before auth if applicable):  
  - `warehouses = []`  
  - `currentWarehouseId = DEFAULT_WAREHOUSE_ID` (placeholder)  
  - `currentWarehouse = null` (no match in empty list)  
  - Context still exposes `currentWarehouseId: effectiveWarehouseId` = **placeholder**.

### Default / fallback value

- The **only** intentional default is `DEFAULT_WAREHOUSE_ID` in `WarehouseContext.tsx` (line 26), used as initial state when localStorage doesn’t have a valid ID.

### If warehouse fetch fails

- In `refreshWarehouses()` catch (lines 96–98):  
  - `setWarehouses([])`  
  - **Does not** change `currentWarehouseId` — so we **keep the placeholder** (or whatever was in state).  
  - So after a failed fetch, the app can keep using the placeholder for all API calls.

### Code that provides `warehouse_id` to POS and dashboard

- **Dashboard:**  
  - `DashboardPage` uses `useWarehouse()` → `currentWarehouseId` (actually `effectiveWarehouseId`).  
  - `warehouseId = currentWarehouseId ?? ''` (line 134).  
  - That is passed to `useDashboardQuery(warehouseId)`, which builds `/api/dashboard?warehouse_id=...`.

- **POS:**  
  - `POSPage` uses `useWarehouse()` → `currentWarehouseId`, `currentWarehouse`, `warehouses`.  
  - `warehouse = currentWarehouse ?? { id: currentWarehouseId, name: 'Loading...', code: '' }`.  
  - CartSheet gets `warehouseId={warehouse?.id ?? currentWarehouseId ?? warehouses[0]?.id ?? ''}`.  
  - So the value sent in the sale payload is that same `warehouseId` (often the placeholder before load).

---

## 3. Dashboard API call

- **Component:** `DashboardPage` (`src/pages/DashboardPage.tsx`).
- **When it fires:** On mount and when `warehouseId` or `refetch` changes; also `refetchOnWindowFocus: true` in `useDashboardQuery`.
- **warehouse_id used:** `warehouseId` from `currentWarehouseId ?? ''` (line 134), i.e. whatever the warehouse context exposes (including the placeholder).
- **If warehouse_id is null at that moment:** Context never exposes `null`; it exposes either the placeholder string or a real ID. So we never send literal null; we send the placeholder when context hasn’t loaded.
- **Guard:** `useDashboardQuery` has `enabled: Boolean(warehouseId?.trim())`. The placeholder is a non-empty string, so the guard **allows** the call. There is **no** check that the ID is a real warehouse (e.g. not the placeholder).

---

## 4. Sale API call in POS

- **warehouse_id in payload:** `payload.warehouseId` in the POST body (POSPage.tsx lines 406, 588).  
- **Where it comes from:** CartSheet is given `warehouseId={warehouse?.id ?? currentWarehouseId ?? warehouses[0]?.id ?? ''}` (line 926). So it’s the same context-derived value (placeholder until real data loads).
- **Check before charge:** There is **no** check in POSPage or CartSheet that `warehouseId` is a valid (non-placeholder) ID before enabling the charge button or sending the request.
- **Charge button:** It can be enabled as soon as there are items in the cart; it is not disabled while `warehouse_id` is still the placeholder.

---

## 5. Database checks (run in Supabase SQL editor)

Run these in the project’s Supabase SQL editor and keep the results for diagnosis:

```sql
-- Does this placeholder warehouse exist?
SELECT * FROM warehouses
WHERE id = '00000000-0000-0000-0000-000000000001';

-- What real warehouses exist?
SELECT id, name, created_at
FROM warehouses
ORDER BY created_at;

-- What warehouse is the current user scoped to? (user_scopes uses user_email)
SELECT us.user_email, us.warehouse_id, us.store_id, w.name AS warehouse_name
FROM user_scopes us
JOIN warehouses w ON w.id = us.warehouse_id
WHERE us.user_email = (auth.jwt() ->> 'email');
```

If the placeholder UUID is not a row in `warehouses`, the server will correctly reject requests that use it (e.g. 503/504 or 400 depending on implementation).

---

## Summary: why the placeholder is sent

1. **WarehouseContext** initializes `currentWarehouseId` to `DEFAULT_WAREHOUSE_ID` when localStorage doesn’t have a valid ID.
2. **Before** `refreshWarehouses()` (and possibly before auth) completes, the context exposes this placeholder as `currentWarehouseId` (via `effectiveWarehouseId`).
3. **Dashboard** and **POS** use this value immediately:  
   - Dashboard: `useDashboardQuery(warehouseId)` runs because `warehouseId` is non-empty (placeholder).  
   - POS: `warehouse.id` / CartSheet `warehouseId` is the same placeholder, so the sale POST body contains it.
4. **No guard** anywhere treats the placeholder as invalid; the dashboard query’s `enabled` only checks `warehouseId?.trim()`.
5. If the placeholder is not a real row in `warehouses`, the server rejects the request → 503/504 and sale failure + stock rollback.

Next: **STEP 2 — Diagnose the exact failure chain** (see your prompt). Then **STEP 3 — Fixes** (guards, charge button disabled until valid warehouse, context init, POS loading state).
