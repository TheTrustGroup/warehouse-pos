# Phase 1 — Complete Diagnostic Report
## Extreme Dept Kidz — warehouse.extremedeptkidz.com

**Date:** 2025-03-06  
**Scope:** Sentinel warehouse ID, data bleeding, sizes vanishing, POS fetch, cross-device sync.

---

## A. WAREHOUSE ID PROBLEM — MAPPED

### 1. Definitions (from codebase)

| Constant | Value | Where defined |
|----------|--------|----------------|
| **SENTINEL_EMPTY_WAREHOUSE_ID** | `00000000-0000-0000-0000-000000000099` | `src/contexts/InventoryContext.tsx` line 139 |
| **PLACEHOLDER_WAREHOUSE_ID**   | `00000000-0000-0000-0000-000000000001` | `src/lib/warehouseId.ts` line 9 |
| **DEFAULT_WAREHOUSE_ID**       | Same as PLACEHOLDER_WAREHOUSE_ID        | `src/contexts/WarehouseContext.tsx` (re-export) |

**Comment in code (InventoryContext.tsx:138):**  
*"Sentinel: used when selection is Main Store id but UI shows 'Main Town' so we never load Main Store data for that label. API returns [] for this id."*

### 2. Database queries you must run (Supabase SQL editor)

Run these and paste results into this doc or reply with them. **I cannot run Supabase SQL from this environment.**

```sql
-- All warehouses
SELECT id, name, created_at, is_active
FROM warehouses
ORDER BY created_at;

-- All stores
SELECT id, name, warehouse_id, created_at
FROM stores
ORDER BY created_at;

-- User warehouse scopes
SELECT
  u.email,
  us.warehouse_id,
  w.name AS warehouse_name
FROM user_scopes us
JOIN warehouses w ON w.id = us.warehouse_id
JOIN auth.users u ON u.id = us.user_id;
```

**From these you will determine:**
- **Main Store real ID:** the UUID for the warehouse that should be "Main Store" (often `00000000-0000-0000-0000-000000000001`).
- **Main Town real ID:** either the same UUID (mislabeled) or a different warehouse.
- **Whether** the same physical warehouse is stored with two different names (data problem) or two different warehouses exist.

### 3. Every place SENTINEL_EMPTY_WAREHOUSE_ID is used

| Location | Why sentinel is used | Real ID that should be used | Can it cause bleed? |
|----------|----------------------|-----------------------------|----------------------|
| **InventoryContext.tsx:158** | `effectiveWarehouseId = isMainStoreIdWithWrongLabel ? SENTINEL_EMPTY_WAREHOUSE_ID : rawWarehouseId` | `rawWarehouseId` (the actual selected warehouse) | Yes — all downstream uses of `effectiveWarehouseId` then use sentinel. |
| **InventoryContext.tsx:360** | `wid = useSentinelForProductsRef.current ? SENTINEL_EMPTY_WAREHOUSE_ID : effectiveWarehouseIdRef.current` — used for **list request** and **cache key** | `rawWarehouseIdRef.current` when sentinel is active | Yes — list returns empty or wrong; cache keyed by sentinel poisons cache. |
| **InventoryContext.tsx:363–364** | **Post-save refetch only:** `fetchWid = postSaveRefetch && useSentinelForProductsRef.current ? (rawWarehouseIdRef.current \|\| wid) : wid` | Already fixed: post-save uses `rawWarehouseIdRef.current` | No for post-save; other refetches still use `wid` (sentinel). |

**Summary:** The sentinel is used so that when the UI shows "Main Town" (placeholder ID but name ≠ "Main Store"), the app intentionally does **not** load Main Store data for that "selection." The side effect is that **all** product list requests use the sentinel, so the API is called with `warehouse_id=00000000-0000-0000-0000-000000000099`. Backend behavior:
- **User with scope:** `allowed.includes(sentinel)` is false → `warehouseId = ''` → **400** "warehouse_id required or must be in your scope."
- **Admin with no scope:** request accepted; `getWarehouseProducts(sentinel)` runs; no rows in `warehouse_inventory` / `warehouse_inventory_by_size` for sentinel → **empty list** or products with empty `quantityBySize` depending on backend filter. So either list fails (400) or returns empty/empty-sizes → cache and state get poisoned.

### 4. isMainStoreIdWithWrongLabel — exact logic

**Where:** `InventoryContext.tsx` lines 152–156.

```ts
const rawWarehouseId = (currentWarehouseId?.trim?.() && currentWarehouseId) ? currentWarehouseId : '';
const mainStoreNameNorm = 'main store';
const isMainStoreIdWithWrongLabel =
  rawWarehouseId === PLACEHOLDER_WAREHOUSE_ID &&
  currentWarehouse &&
  (currentWarehouse.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') !== mainStoreNameNorm;
```

**Trigger:** True when **all** of:
1. `rawWarehouseId === PLACEHOLDER_WAREHOUSE_ID` (`00000000-0000-0000-0000-000000000001`),
2. `currentWarehouse` exists (from `warehouses.find(w => w.id === effectiveWarehouseId)` in WarehouseContext),
3. Normalized warehouse name ≠ `"main store"` (e.g. "Main Town", "main town", etc.).

**Why "Main Store" can show as "Main Town":**
- **Data:** The warehouse row in `warehouses` for id `00000000-0000-0000-0000-000000000001` has `name = 'Main Town'` (or similar) instead of "Main Store."
- **Code:** WarehouseContext gets `currentWarehouseId` from `/api/warehouses` (or localStorage). The API returns the same UUID for the only warehouse but with a different `name`. So it’s either a **data problem** (wrong name in DB) or a **naming inconsistency** (e.g. store vs warehouse display name).

**Conclusion:** The flag is a **code workaround**: when the UI shows a different label for the placeholder ID, the app avoids loading Main Store data by switching to the sentinel. That workaround causes all the listed bugs.

### 5. rawWarehouseId vs effectiveWarehouseId — resolution chain

**Where computed:**
- **WarehouseContext** (`src/contexts/WarehouseContext.tsx`):  
  - Internal state: `currentWarehouseId` (selected or from bound).  
  - Exposed as: `currentWarehouseId: effectiveWarehouseId` where `effectiveWarehouseId = boundWarehouseId || currentWarehouseId`.  
  - So the **context exposes** the bound-or-selected warehouse ID (e.g. `00000000-0000-0000-0000-000000000001`).
- **InventoryContext** (`src/contexts/InventoryContext.tsx`):  
  - `rawWarehouseId = currentWarehouseId` from `useWarehouse()` → same as WarehouseContext’s exposed value (the real warehouse ID).  
  - `effectiveWarehouseId = isMainStoreIdWithWrongLabel ? SENTINEL_EMPTY_WAREHOUSE_ID : rawWarehouseId`.  
  - So when the label is "wrong," **effectiveWarehouseId** becomes the sentinel and **rawWarehouseId** stays the real UUID.

**When they diverge:** Whenever `isMainStoreIdWithWrongLabel` is true (placeholder ID + name ≠ "main store"). Then:
- **rawWarehouseId** = real warehouse UUID (e.g. Main Store).
- **effectiveWarehouseId** = sentinel UUID.

**Full chain:**
1. User logs in → auth/session.
2. WarehouseContext: `refreshWarehouses()` → GET `/api/warehouses` → `warehouses` list; if user has one scope/bound, `currentWarehouseId` set to that (or first warehouse).
3. `currentWarehouse = warehouses.find(w => w.id === effectiveWarehouseId)`; if that warehouse’s `name` is "Main Town," UI shows "Main Town."
4. InventoryContext: `rawWarehouseId` = that same ID; `isMainStoreIdWithWrongLabel` = true → `effectiveWarehouseId` = sentinel.
5. All API calls that use `effectiveWarehouseId` (productsPath, productByIdPath, persistProducts, Realtime, etc.) send the **sentinel**.
6. `loadProducts`: `wid` = sentinel (except post-save where `fetchWid` uses `rawWarehouseIdRef`); cache key = `wid` → sentinel; so list/cache are for the fake warehouse.

---

## B. WAREHOUSE DATA BLEEDING — DIAGNOSIS

**Symptom:** Main Store records show in Main Town.

**Cause:** When the UI shows "Main Town," the app is still using the **same** warehouse ID as Main Store (placeholder `00000000-0000-0000-0000-000000000001`). So "Main Town" and "Main Store" are the **same** warehouse in the DB; the only difference is the **display name** (wrong or alternate). There is no separate "Main Town" warehouse with its own data — so there is no true "bleed" between two warehouses; it’s one warehouse with a naming/display bug and sentinel logic that then breaks list/Realtime/cache.

**To confirm** run:

```sql
-- Products per warehouse
SELECT
  w.name AS warehouse_name,
  w.id AS warehouse_id,
  COUNT(wp.id) AS product_count
FROM warehouses w
LEFT JOIN warehouse_products wp ON wp.warehouse_id = w.id
GROUP BY w.id, w.name
ORDER BY w.name;

-- If warehouse_products has no warehouse_id, use:
SELECT
  w.name AS warehouse_name,
  w.id AS warehouse_id,
  (SELECT COUNT(*) FROM warehouse_inventory wi WHERE wi.warehouse_id = w.id) AS inventory_records
FROM warehouses w
ORDER BY w.name;

-- Inventory records per warehouse
SELECT
  w.name AS warehouse_name,
  COUNT(wi.id) AS inventory_records
FROM warehouses w
LEFT JOIN warehouse_inventory wi ON wi.warehouse_id = w.id
GROUP BY w.id, w.name;

-- Size records per warehouse
SELECT
  w.name AS warehouse_name,
  COUNT(wis.id) AS size_records,
  SUM(wis.quantity) AS total_units
FROM warehouses w
LEFT JOIN warehouse_inventory_by_size wis ON wis.warehouse_id = w.id
GROUP BY w.id, w.name;

-- Sales per warehouse
SELECT
  w.name AS warehouse_name,
  COUNT(s.id) AS sale_count,
  SUM(s.total) AS total_revenue
FROM warehouses w
LEFT JOIN sales s ON s.warehouse_id = w.id
GROUP BY w.id, w.name;
```

Interpretation:
- If there is only one warehouse UUID with products/inventory/sales and it’s the placeholder, then "Main Town" is just a wrong name for that same warehouse.
- If there are two warehouse UUIDs (e.g. Main Store and Main Town) and each has its own data, then the frontend must never send the wrong ID (no sentinel for list/refetch; strict use of real ID per selection).

---

## C. POS PRODUCT FETCH — DIAGNOSIS

**Where:** `src/pages/POSPage.tsx`.

- **API:** Same backend: `GET /api/products?warehouse_id=${encodeURIComponent(wid)}&limit=250`.
- **Warehouse ID used:** `wid` = `warehouse.id` (line 338, 359, 387, 391).  
  `warehouse` = `currentWarehouse ?? { id: currentWarehouseId, ... }`, and `effectiveWarehouseId = warehouse?.id ?? currentWarehouseId ?? ...`.  
  So POS uses **WarehouseContext’s effective warehouse ID**. That is the **same** value InventoryContext gets as `currentWarehouseId` — i.e. the **real** warehouse ID (e.g. placeholder), **not** the sentinel, because WarehouseContext does not apply the "wrong label" sentinel logic. So POS sends the **real** warehouse ID to the API.
- **Limit:** 250 per request; no pagination loop in POS (single request).
- **Reuse:** When `currentWarehouseId === wid && inventoryProducts.length > 0`, POS reuses `inventoryProducts` from InventoryContext and still calls `loadProducts(wid, true, signal)` in background. So if InventoryContext has empty/wrong data (sentinel), POS can show that until its own fetch completes; then POS overwrites with its 250-cap fetch.

**Conclusion:**
- **POS warehouse ID:** Real ID (not sentinel). So "POS not fetching all products" is **not** caused by sentinel in POS itself.
- **Possible causes:** (1) Backend limit 250 and Main Store has >250 products (POS shows 250 only). (2) Backend filtering (e.g. only products with inventory for that warehouse). (3) If POS ever saw `inventoryProducts` from InventoryContext when that context was poisoned (sentinel), it could briefly show wrong/empty list until its own fetch completes.

**Diagnostic query (run in Supabase):**

```sql
-- Replace [MAIN_STORE_REAL_ID] with the actual UUID (e.g. 00000000-0000-0000-0000-000000000001)
SELECT COUNT(*) AS should_show
FROM warehouse_inventory wi
WHERE wi.warehouse_id = '[MAIN_STORE_REAL_ID]';
-- If schema is one row per product globally, count products that have inventory in this warehouse.
```

Compare that count with what POS shows. If DB count > 250, add pagination or higher limit for POS.

---

## D. CROSS-DEVICE SYNC — DIAGNOSIS

**useInventoryRealtime** (`src/hooks/useInventoryRealtime.ts`):
- **Warehouse ID passed:** `warehouseId` from the only argument. In InventoryContext it’s called as `useInventoryRealtime(effectiveWarehouseId, { onRefetch: onRealtimeRefetch })` (line 746). So when `isMainStoreIdWithWrongLabel` is true, **Realtime subscribes to the sentinel ID**.
- **Filter:** `filter: 'warehouse_id=eq.' + warehouseId` for `warehouse_inventory_by_size` and `sales`. So subscription is for `warehouse_id=eq.00000000-0000-0000-0000-000000000099`. No rows exist for that UUID → **no events ever fire** → no refetch on other devices/tabs.
- **Tables:** Subscribes to `warehouse_inventory_by_size` (with filter), `sales` (with filter), and `warehouse_products` (no filter; table-level). So size changes in `warehouse_inventory_by_size` are only seen when the filter matches the **real** warehouse ID.
- **onRefetch:** Calls `loadProductsRef.current(undefined, { silent: true, bypassCache: true })` — no `postSaveRefetch`, so that refetch uses **wid = sentinel** again → wrong/empty list even if we fixed the subscription.

**Conclusion:** Realtime is using the **sentinel** when the wrong-label condition holds, so it receives **no** size/inventory events and any refetch it triggers still uses the sentinel. Both must be fixed: pass **real** warehouse ID to Realtime and use **real** ID for the refetch triggered by Realtime.

---

## E. REMAINING SENTINEL CONTAMINATION — CHECKLIST

| Flow | Warehouse ID used | Uses sentinel? | Fix needed? |
|------|--------------------|----------------|-------------|
| **loadProducts (initial fetch)** | `wid` → sentinel when flag true | Yes | Yes — use real ID for fetch (e.g. getRefetchWarehouseId) |
| **Post-save refetch** | `fetchWid` = rawWarehouseId when postSaveRefetch | No | Already fixed |
| **Realtime subscription** | `effectiveWarehouseId` | Yes | Yes — pass real ID when sentinel active |
| **React Query cache keys** | `queryKeys.products(wid)` / `queryKeys.products(effectiveWarehouseId)` | Yes when wid/effective = sentinel | Yes — use real ID so cache is per real warehouse |
| **Dashboard stats fetch** | `queryKeys.dashboard(effectiveWarehouseId, ...)` | Yes | Yes |
| **POS product fetch** | `warehouse.id` (from WarehouseContext) | No | No (POS uses real ID) |
| **After delivery received refetch** | Not found in scanned code; if it calls loadProducts without postSaveRefetch | Would use wid | Yes if present |
| **After sale completed refetch** | POS uses its own loadProducts(wid) with real wid | No | No |
| **Visibility refetch** | `loadProductsRef.current(undefined, { silent: true, bypassCache: true })` | Yes (no postSaveRefetch) | Yes |
| **Polling refetch (useRealtimeSync)** | `loadProducts(undefined, { silent: true, bypassCache: true })` | Yes | Yes |
| **persistProducts / setStoredData** | `productsCacheKey(effectiveWarehouseId)` | Yes | Yes — persist under real ID |
| **productByIdPath / productsPath** | `effectiveWarehouseId` | Yes | Yes — use real ID for API paths |
| **addProduct / updateProduct / deleteProduct** | payload `warehouseId: effectiveWarehouseId` or from updates | Yes for cache/query invalidation | Yes — invalidate/update with real ID |
| **syncLocalInventoryToApi** | `productsPath(..., effectiveWarehouseId)` | Yes | Yes |
| **verifyProductSaved** | `productByIdPath(..., effectiveWarehouseId)` | Yes | Yes |
| **loadMore** | `productsPath(..., effectiveWarehouseId)` | Yes | Yes |

---

## F. BACKEND LIST AND PUT (Cause F & G)

**Backend list** (`inventory-server/lib/data/warehouseProducts.ts` — `getWarehouseProducts(warehouseId, ...)`):
- Builds `sizeMap` from `warehouse_inventory_by_size` with `.eq('warehouse_id', effectiveWarehouseId)`. So wrong or sentinel ID → no rows → empty `quantityBySize` (or fallback size codes with 0). So **Cause F** is confirmed: list is per-warehouse; wrong/sentinel ID → empty sizes or empty list.

**Backend PUT** (`inventory-server/app/api/products/[...id]/route.ts`):
- After RPC `update_warehouse_product_atomic`, calls `fetchOne(db, id, wid)` with the **real** `wid` from body/auth. So response is for the real warehouse. **Cause G** (RPC not writing `warehouse_inventory_by_size`) is mitigated by: (1) manual fallback that deletes and re-inserts by_size rows; (2) response patch when `sizesToWrite.length > 0 && qtyBySize.length === 0` (lines 254–259). So PUT response should include sizes. If it still doesn’t, the RPC or manual path needs to be verified to always write and return by_size.

**Realtime publication:** You should confirm in Supabase:

```sql
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'warehouse_inventory_by_size';
```

If 0 rows, add:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_inventory_by_size;
```

---

## PHASE 2 — SUMMARY BOXES (to fill after you run SQL)

### WAREHOUSE IDENTITY

- Main Store real ID: _[from SQL]_
- Main Town real ID: _[from SQL]_
- Sentinel ID: `00000000-0000-0000-0000-000000000099`
- Why sentinel is used: To avoid loading "Main Store" data when the UI label is "Main Town" (placeholder ID with wrong name).
- When isMainStoreIdWithWrongLabel is true: When `rawWarehouseId === PLACEHOLDER_WAREHOUSE_ID` and warehouse name (normalized) ≠ `"main store"`.
- Are these truly separate warehouses? _[YES/NO from SQL]_
- Does Main Town have its own real data? _[YES/NO from SQL]_
- Is Main Town data actually Main Store data shown with wrong warehouse ID? _[YES/NO]_

### DATA BLEED

- Products in Main Store: _[N from SQL]_
- Products in Main Town: _[N from SQL]_
- Root cause: _[One warehouse with two names / or two warehouses and frontend using wrong ID]_

### SIZES VANISHING

- Cause A (sentinel on refetch): **CONFIRMED** — only post-save uses real ID; all other refetches use sentinel when flag true.
- Cause B (offline list): **CONFIRMED FIXED**
- Cause C (payload): **CONFIRMED FIXED**
- Cause D–E (cache): **STILL AN ISSUE** — cache key and merge use `wid`/sentinel.
- Cause G (RPC): **MITIGATED** — manual update and response patch; verify in production.
- Remaining unfixed: A, D, E, and all other flows in table E (visibility, poll, Realtime, paths, persist, invalidation).

### POS MISSING PRODUCTS

- Products in DB for Main Store: _[from SQL]_
- Products shown in POS: _[from UI]_
- Reason: _[Limit 250 / or sentinel only if POS reused poisoned inventory list]_

### CROSS-DEVICE SYNC

- Realtime subscription using: **Sentinel** when isMainStoreIdWithWrongLabel.
- Tables in publication: _[from SQL above]_
- Why updates don’t cross devices: Realtime filter is sentinel → no rows → no events; refetch after event would use sentinel anyway.

---

## COMPLETE FIX LIST (priority order)

1. **Resolve warehouse identity** (Fix 1): Either fix DB (correct name for placeholder warehouse) or remove sentinel and always use real warehouse ID for all requests and cache.
2. **InventoryContext — use real ID everywhere when sentinel would have been used** (Fix 3): Introduce `getRefetchWarehouseId(...)` and use it for: initial load, visibility refetch, polling refetch, Realtime onRefetch, loadMore, productsPath, productByIdPath, cache key, persist key, query invalidation, syncLocalInventoryToApi, verifyProductSaved. Ensure Realtime receives real warehouse ID (Fix 5).
3. **useInventoryRealtime** (Fix 5): Pass real warehouse ID when sentinel is active (e.g. from context or a dedicated ref).
4. **POS** (Fix 4): Ensure it always gets real ID (already does from WarehouseContext). If product count > 250, add pagination or higher limit for POS-only.
5. **Backend** (Fix 6): Confirm RPC and manual update always write `warehouse_inventory_by_size` and that PUT response includes full sizes; add `warehouse_inventory_by_size` to Realtime publication if missing.
6. **Separation / no bleed** (Fix 2): After identity is fixed, ensure every endpoint and frontend path uses the user’s assigned/selected warehouse ID only (no sentinel for data).

No fix code has been written; this is diagnosis only. Run the SQL above, fill in the Phase 2 boxes, and then approve before Phase 3 (implementation).
