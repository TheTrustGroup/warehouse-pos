# Phase 1 — Complete Architecture Audit

**Warehouse POS — Data Layer & Warehouse Isolation Refactor**  
**Date:** 2025-03-06  
**Scope:** Trace warehouse identity, data fetching, caches, state ownership, and the sentinel problem. No code changes — audit only.

---

## A. WAREHOUSE IDENTITY CHAIN

### Trace: User login → API call

| Step | What happens |
|------|----------------|
| 1. User logs in | `AuthContext.login()` → POST `/admin/api/login` or `/api/auth/login` with email/password. |
| 2. Auth session created | Response includes token and user payload. `normalizeUserData()` sets `user.warehouseId` from `userData.warehouse_id ?? userData.warehouseId`. |
| 3. user_scopes queried | **Server-side only.** `getScopeForUser(auth.email)` in `inventory-server/lib/data/userScopes.ts` reads `user_scopes` (keyed by `user_email`), returns `allowedWarehouseIds`. Not queried by the frontend directly. |
| 4. Warehouse assigned to user | **Frontend:** `user.warehouseId` comes from login response or from GET `/api/auth/user` (when cashier and `warehouseId` missing, frontend fetches `/api/auth/user` again to enrich). **Server:** `getEffectiveWarehouseId(auth, bodyWarehouseId)` uses `getScopeForUser(auth.email)` → `allowedWarehouseIds`; if body warehouse in scope, use it; else use `allowed[0]`. |
| 5. Warehouse ID stored where? | **Frontend:** (1) `AuthContext`: `user.warehouseId` in state and `localStorage['current_user']`. (2) `WarehouseContext`: `boundWarehouseId = auth?.user?.warehouseId`; `currentWarehouseId` in state (or from localStorage `warehouse_current_id`); **exposed** as `effectiveWarehouseId = boundWarehouseId \|\| currentWarehouseId`. (3) `InventoryContext`: derives `rawWarehouseId`, `effectiveWarehouseId`, `dataWarehouseId` (see table below). |
| 6. Which component reads it? | Dashboard, Inventory (InventoryPage / Inventory.tsx), POS, Sidebar, Deliveries, Sales — all use `useWarehouse()` for `currentWarehouseId` / `currentWarehouse`. InventoryContext also uses it to compute `dataWarehouseId` for API calls. |
| 7. How does it reach API calls? | `InventoryContext`: `productsPath()`, `productByIdPath()`, `loadProducts()` use `dataWarehouseId` (or refs `dataWarehouseIdRef.current` / `fetchWid`) as `warehouse_id` query param. React Query `queryKeys.products(warehouseId)` use same ID. Realtime hook receives `dataWarehouseId`. |

### Every variable that holds a warehouse ID

| Variable name | File | What it contains | When it changes |
|---------------|------|-------------------|-----------------|
| **user.warehouseId** | AuthContext (from API) | Single warehouse for POS/cashier from login or `/api/auth/user` | On login, or when `tryRefreshSession` / `checkAuthStatus` enriches cashier with warehouse_id |
| **boundWarehouseId** | WarehouseContext.tsx | `auth?.user?.warehouseId?.trim()` — session-bound warehouse | When auth user changes |
| **currentWarehouseId** (state) | WarehouseContext.tsx | User-selected warehouse ID from dropdown, or from localStorage on init, or first warehouse from list | When user selects different warehouse; when `refreshWarehouses()` sets first or bound |
| **effectiveWarehouseId** (WarehouseContext) | WarehouseContext.tsx | `boundWarehouseId \|\| currentWarehouseId` — what the UI “current warehouse” is | When bound or selection changes |
| **currentWarehouseId** (exposed) | WarehouseContext.tsx | Same as effectiveWarehouseId (context value) | — |
| **rawWarehouseId** | InventoryContext.tsx | `currentWarehouseId` from useWarehouse() if non-empty, else `''` | When warehouse selection changes |
| **isMainStoreIdWithWrongLabel** | InventoryContext.tsx | True when rawWarehouseId === PLACEHOLDER_WAREHOUSE_ID and currentWarehouse.name (normalized) ≠ `"main store"` | When warehouse list/name or selection changes |
| **effectiveWarehouseId** (InventoryContext) | InventoryContext.tsx | If isMainStoreIdWithWrongLabel then SENTINEL_EMPTY_WAREHOUSE_ID, else rawWarehouseId | When sentinel logic applies |
| **dataWarehouseId** | InventoryContext.tsx | `getDataWarehouseId(isMainStoreIdWithWrongLabel, rawWarehouseId, effectiveWarehouseId)` → when useSentinel: rawId, else effectiveId. So: when “wrong label” we use **raw** for data so API gets real ID. Comment says “use real ID so API returns correct sizes”. | When sentinel/raw/effective change |
| **SENTINEL_EMPTY_WAREHOUSE_ID** | InventoryContext.tsx | Constant `'00000000-0000-0000-0000-000000000099'` | Never |
| **PLACEHOLDER_WAREHOUSE_ID** | src/lib/warehouseId.ts | Constant `'00000000-0000-0000-0000-000000000001'` | Never |
| **DEFAULT_WAREHOUSE_ID** | WarehouseContext.tsx | Re-export of PLACEHOLDER_WAREHOUSE_ID | Never |
| **effectiveWarehouseIdRef** | InventoryContext.tsx | Ref mirror of effectiveWarehouseId | In useEffect when effectiveWarehouseId etc. change |
| **rawWarehouseIdRef** | InventoryContext.tsx | Ref mirror of rawWarehouseId (used for post-save refetch) | Same |
| **dataWarehouseIdRef** | InventoryContext.tsx | Ref mirror of dataWarehouseId | Same |
| **useSentinelForProductsRef** | InventoryContext.tsx | Ref mirror of isMainStoreIdWithWrongLabel | Same |
| **queryWarehouseId** | API route (products) | From URL `searchParams.get('warehouse_id')` | Per request |
| **warehouseId** (API) | API route (products) | Resolved: if query in scope use it, else allowed[0], else '' | Per request |
| **effectiveWarehouseId** (API) | API route (POST/PUT) | From getEffectiveWarehouseId(auth, bodyWarehouseId) | Per request |

**Conclusion:** There are many warehouse ID variables. The frontend alone has: user.warehouseId, boundWarehouseId, currentWarehouseId (state), effectiveWarehouseId (exposed), rawWarehouseId, isMainStoreIdWithWrongLabel, effectiveWarehouseId (sentinel branch), dataWarehouseId, plus refs. This is the core of the confusion.

---

## B. DATA FETCHING CHAIN

**For the products list:** from “user opens inventory page” to “product card renders with correct quantity”.

| Step | What happens | Where it can go wrong |
|------|----------------|------------------------|
| 1. Page mounts | Inventory page (Inventory.tsx or InventoryPage.tsx) mounts. useInventoryPageState() calls useInventory(), useWarehouse(). | — |
| 2. Which hook/context fires? | InventoryProvider is already mounted (wraps app). Its useEffect depends on `currentWarehouseId` (from WarehouseContext). So when warehouse is set, effect runs: getCachedProductsForWarehouse(dataWarehouseId), then loadProducts(ac.signal, { bypassCache: true } or { silent: true, bypassCache: true }). | If dataWarehouseId is sentinel, cache key is sentinel and API may 400 or return empty. |
| 3. What warehouse ID does it use? | loadProducts uses dataWarehouseIdRef.current (wid) and fetchWid. Comment says “Always use real warehouse ID for fetch and cache”. getDataWarehouseId returns rawId when useSentinel so dataWarehouseId is **real** ID when label is wrong. So fetch should use real ID. Cache key is same. But effectiveWarehouseId was set to sentinel when isMainStoreIdWithWrongLabel — so persistProducts and productsPath use dataWarehouseId which is real. So currently: dataWarehouseId = real when wrong label (useSentinel && rawId → rawId). So API is called with real ID. Realtime gets dataWarehouseId (real). | Historical bug: previously fetchWid could be sentinel and cache key sentinel; post-save used raw. Now dataWarehouseId is real for fetches. Remaining risk: any code path that still uses effectiveWarehouseId for API. |
| 4. What API endpoint is called? | GET `/api/products?warehouse_id=<dataWarehouseId>&limit=250&offset=0` (and further pages). Via apiGet(API_BASE_URL, path) or via queryClient.fetchQuery({ queryKey: queryKeys.products(fetchWid), queryFn: ... }). | Timeout, 401, 403, 404 (then fallback to /admin/api/products). |
| 5. What does the API query in DB? | inventory-server: getWarehouseProducts(warehouseId, { limit, offset, q, category, ... }). warehouse_products has no warehouse_id (one row per product); then warehouse_inventory and warehouse_inventory_by_size for that warehouseId and page’s product IDs. Products with no inventory/size rows for that warehouse are **filtered out** (filtered = data.filter(p => invMap[p.id] !== undefined \|\| (sizeMap[p.id]?.length ?? 0) > 0)). | If sizes query fails (e.g. size_codes join missing), fallback retry without join; if that fails, sizeMap empty → product dropped or quantity 0. INNER logic: only products with at least one inv or size row returned. |
| 6. What does the API return? | { data: ListProduct[], total: number }. Each ListProduct has quantityBySize (array of { sizeCode, sizeLabel?, quantity }), quantity (sum or from inv). | — |
| 7. How is response mapped to state? | parseProductsResponse(raw) → normalizeProduct(p) for each item. Merged with local-only products from localStorage (productsCacheKey(wid)). Then complex merge: preserve images/sizes from cache when API omits; prefer current state when API has synthetic “One size” or empty but state has real sizes; lastUpdatedProduct overwrite; fallback to localStorage if merged.length === 0. Then setProducts(listToSet). Also cacheRef.current[wid], setStoredData(productsCacheKey(wid)), saveProductsToDb(listToSet). | Cache/state overwriting: if a later silent refetch returns empty sizes (e.g. API bug or wrong ID), merge logic can prefer “current state” — but if refetch runs after state was cleared (e.g. warehouse switch), wrong data. Multiple sources of truth. |
| 8. What cache stores it? | (1) React Query: queryKeys.products(fetchWid). (2) cacheRef.current[wid] (in-memory, TTL 60s). (3) localStorage productsCacheKey(wid). (4) IndexedDB via saveProductsToDb (offlineDb). (5) When offline enabled: Dexie (useInventory hook). | All can hold stale data. Refetch or Realtime can invalidate React Query but state is set by loadProducts, not by useQuery. So invalidation triggers refetch in loadProducts’ fetchQuery; then loadProducts merges and setStates. |
| 9. What does the component read? | useInventory() returns products (from apiOnlyProducts or offline.products), productsWithLocalImages. Page uses products / filteredProducts. | — |
| 10. What does the card display? | ProductCard receives product; getTotalQuantity(product) = sum(quantityBySize) or product.quantity; displays that and per-size breakdown. | If quantityBySize is empty or zero due to merge/refetch bug, card shows 0. |

**Bug map (where things go wrong):**  
- Step 3: Any path still using sentinel for fetch/cache.  
- Step 5: Backend filter drops products with no inv/size row; sizes query failure drops sizes.  
- Step 7: Merge logic (cache/state preference) can overwrite good data with bad or vice versa; post-save refetch with wrong ID can overwrite sizes.  
- Step 8: Multiple caches; state not driven by single source.  
- Step 10: Display is correct if data in state is correct; state is wrong when any of the above fail.

---

## C. CACHE LAYERS

| Cache | Library / Location | What it stores | TTL / Life | Invalidation | Can serve stale and override fresh? |
|-------|--------------------|----------------|-----------|--------------|-------------------------------------|
| **React Query** | @tanstack/react-query | Products list per queryKey: ['products', warehouseId]; also dashboard, sales, posProducts, reports | staleTime 2 min, gcTime 10 min (InventoryContext) | invalidateQueries on Realtime, after add/update/delete, visibility | Yes — loadProducts uses fetchQuery and then merges into state; if another tab or Realtime invalidates, refetch runs but state update is async and merge logic can keep old or mix. |
| **cacheRef** (in-memory) | InventoryContext useRef | Per-wid object { data: Product[], ts } | 60s (PRODUCTS_CACHE_TTL_MS) | Overwritten when loadProducts completes | Yes — 60s TTL used to avoid refetch; silent refresh can be throttled; so stale list can be shown. |
| **localStorage** | getStoredData / setStoredData | Key `warehouse_products_${warehouseId}` → Product[] | Persistent | Written on every loadProducts success and on add/update; read on mount and on API failure fallback | Yes — on API failure, loadProducts sets state from localStorage; if that list is old or wrong warehouse, we show wrong data. |
| **IndexedDB** | offlineDb (saveProductsToDb) + inventoryDB (Dexie) | Products store; when offline enabled, Dexie is source for useInventory | Persistent | Written on loadProducts success; Dexie updated by mirrorProductsFromApi | Yes — when offline enabled, products come from Dexie; when API-only, saveProductsToDb still writes; fallback reads can be stale. |
| **In-memory state** | useState(apiOnlyProducts) / offline.products | Current list in InventoryContext | Until unmount or next setState | setProducts from loadProducts, addProduct, updateProduct, deleteProduct | Yes — this is what UI reads; if a refetch completes later with wrong/empty data, setProducts can overwrite. |
| **Session/backend** | getScopeForUser cache (userScopes.ts) | allowedWarehouseIds per email | 30s | — | No (server-only). |

**On “can override fresh data”:**  
- React Query: Indirect. Invalidation triggers loadProducts’ fetchQuery; the merge in loadProducts can prefer cache/current state over API when API has empty/synthetic sizes — so “stale” (current state) overrides “fresh” (API) in that branch.  
- cacheRef: Used to show cached list when cacheValid; can prevent refetch for 60s so “stale” is shown.  
- localStorage: On API failure, we set state from localStorage — so stale overwrites (we intentionally show last saved).  
- IndexedDB: When offline, Dexie is source; when online, mirrorProductsFromApi merges; can be out of sync.  
- State: Directly overwritten by any setProducts from loadProducts or mutations; post-save refetch can overwrite with bad response if API returns empty sizes.

---

## D. STATE OWNERSHIP

**Who owns the product list?**

- **InventoryContext** — Yes. useState(apiOnlyProducts) (or offline.products when offline). This is what the UI reads.
- **React Query cache** — Yes. queryClient.fetchQuery(queryKeys.products(wid)) is used inside loadProducts to fetch; the **state** is then set from the result (and merge). So React Query holds a copy but the “owner” of what the page shows is InventoryContext state.
- **Local state in InventoryPage** — No. Page uses useInventory() and filters/search on top of context products.
- **IndexedDB** — When offline enabled, Dexie (useInventory from hooks/useInventory.js) is the source for the list; InventoryContext’s products = offline.products. So ownership is shared (Dexie + context).
- **localStorage** — Not direct owner; used as fallback and persistence. So: **multiple owners** — context state (and when offline, Dexie), plus React Query, plus localStorage/IndexedDB as fallback/persistence.

**When a product is updated, how many places need to be updated?**

1. **setApiOnlyProductsState** (or offline.updateProduct) — context state.  
2. **cacheRef.current[dataWarehouseId]** — in-memory cache.  
3. **localStorage** — setStoredData(productsCacheKey(dataWarehouseId), newList).  
4. **IndexedDB** — saveProductsToDb(newList).  
5. **React Query** — invalidateQueries(products, dashboard); sometimes refetchQueries(dashboard). Then loadProducts(undefined, { bypassCache: true, silent: true, postSaveRefetch: true }) runs — so React Query is refetched and then state is set again from that fetch (plus merge).  
6. **Last updated product ref** — lastUpdatedProductRef.current = { product: finalProduct, at } so merge logic preserves it for 10 min.

Every place above is a risk of inconsistency. The post-save refetch (step 5) is the one that can overwrite good state with empty sizes if the refetch uses wrong ID or API returns incomplete data.

---

## E. THE SENTINEL PROBLEM — ROOT CAUSE ANALYSIS

### 1. What IS the sentinel ID? (00000000-0000-0000-0000-000000000001 vs 099)

- **PLACEHOLDER_WAREHOUSE_ID** = `00000000-0000-0000-0000-000000000001` (in warehouseId.ts).  
- **SENTINEL_EMPTY_WAREHOUSE_ID** = `00000000-0000-0000-0000-000000000099` (in InventoryContext.tsx).

So there are **two** UUIDs: **001** is the “placeholder” and is **often the real Main Store ID** in the DB (docs and code say so). **099** is the “sentinel” used when we want to **avoid** loading Main Store data (when the UI shows “Main Town” but the ID is 001). So: **001** can be a real warehouse row; **099** is **not** a real warehouse — it was chosen as a fake ID so that when we pass it to the API, we either get 400 (not in scope) or empty list (no rows for that ID).

### 2. Why does the sentinel exist in the code?

To solve: “Main Town” is shown in the UI (because the warehouse name in DB for ID 001 is “Main Town” or similar), but the **id** is still 001 (Main Store’s id). So if we used 001 for data fetches, we’d load **Main Store’s** products while the label says “Main Town” — “bleed” of Main Store into the Main Town view. The workaround was: when we detect “placeholder ID but label ≠ Main Store”, set **effectiveWarehouseId = 099** (sentinel) so that we **don’t** request Main Store data for that selection. So the sentinel exists to **avoid** showing Main Store data when the UI says “Main Town”.

### 3. What is SENTINEL_EMPTY_WAREHOUSE_ID? Same as 001 or different?

**Different.** SENTINEL_EMPTY_WAREHOUSE_ID = **099**. PLACEHOLDER_WAREHOUSE_ID = **001**. So 099 is the “empty” sentinel; 001 is the placeholder that is often the real Main Store ID.

### 4. What is isMainStoreIdWithWrongLabel? What exact condition makes this true? Why would Main Store ever have a wrong label?

- **Condition:**  
  `rawWarehouseId === PLACEHOLDER_WAREHOUSE_ID` (i.e. 001) **and**  
  `currentWarehouse` exists **and**  
  `(currentWarehouse.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') !== 'main store'`.

- So: the **id** is 001 (Main Store’s id) but the **name** of that warehouse in the list (from `/api/warehouses`) is not “main store” (e.g. “Main Town”). That’s “wrong label” — same ID, different display name. It happens when the **database** has `name = 'Main Town'` (or similar) for the row with id 001, i.e. a data/naming issue, or when the API returns one warehouse with an alternate name.

### 5. What does rawWarehouseId contain when isMainStoreIdWithWrongLabel is true? What does effectiveWarehouseId contain?

- **rawWarehouseId** = the real warehouse UUID, e.g. `00000000-0000-0000-0000-000000000001` (unchanged).  
- **effectiveWarehouseId** (in InventoryContext) = when isMainStoreIdWithWrongLabel is true, it is set to **SENTINEL_EMPTY_WAREHOUSE_ID** (099). So: raw = real ID (001), effective = sentinel (099).

**getDataWarehouseId(useSentinel, rawId, effectiveId)** returns:  
`useSentinel && rawId ? rawId : effectiveId`. So when we **use** sentinel (wrong label), we pass **rawId** (001) for data fetches — so API gets the **real** ID. That was a later fix so that API returns correct sizes instead of empty. So for **fetch**, dataWarehouseId = 001 (real); for **display/context** effectiveWarehouseId can still be 099 in the sentinel branch, but the refs and dataWarehouseId are wired to send real ID to API.

### 6. Is the sentinel used as a warehouse ID in API calls? What does the API return for the sentinel?

- **Current code:** dataWarehouseId (used in productsPath, loadProducts fetch, Realtime) is **real** when useSentinel (getDataWarehouseId returns rawId). So **currently** the API is called with the **real** warehouse ID (001), not 099, for product list and Realtime.
- **If** the API were called with 099:  
  - User with scope: allowedWarehouseIds typically does not include 099 → warehouseId becomes '' → **400** “warehouse_id required or must be in your scope”.  
  - Admin with no scope: getWarehouseProducts('099', ...) runs; there are no rows in warehouse_inventory or warehouse_inventory_by_size for warehouse_id = '099' → filtered list is **empty** (or only products that somehow have 099 rows, which is none). So API would return **empty array** or empty sizes.

So: the sentinel (099) was never a real warehouse; it was used so we’d either get 400 or empty data and thus “not show Main Store data when label says Main Town”. The fix to use dataWarehouseId = rawId for fetches means we now call the API with the real ID and get real products/sizes — but the rest of the sentinel/effective/raw/ref logic remains and is a source of confusion and risk.

---

## Summary

- **A.** Many warehouse ID variables (user, bound, current, effective, raw, sentinel, dataWarehouseId, refs) across Auth, Warehouse, and Inventory contexts and API.  
- **B.** Data flow: page → InventoryContext loadProducts → dataWarehouseId (now real when “wrong label”) → GET /api/products → getWarehouseProducts → merge into state + 4 caches; card reads from context state. Failure points: backend filter, sizes query, merge logic, refetch overwriting.  
- **C.** Five client-side caches (React Query, cacheRef, localStorage, IndexedDB, context state); any can hold or feed stale data and override fresh.  
- **D.** Product list is “owned” by both context state and (when offline) Dexie; React Query and storage are secondary; updates must touch state, cacheRef, localStorage, IndexedDB, and trigger refetch — many places to keep in sync.  
- **E.** Sentinel 099 was a fake ID to avoid loading Main Store when UI said “Main Town”; 001 is often real Main Store; isMainStoreIdWithWrongLabel = (id 001 and name ≠ “main store”); raw = 001, effective = 099 in that case; dataWarehouseId was fixed to send 001 to API so sizes are correct, but the overall sentinel/effective/raw design remains fragile.

**Next:** Phase 2 — New architecture design document (single warehouse ID, single cache, warehouse isolation, no sentinel). Await approval before any code.
