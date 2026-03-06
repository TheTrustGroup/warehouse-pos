# Trace: Why Product Sizes Vanish or Reset

This document traces every path where `sizeKind` / `quantityBySize` can be lost from save to display, and the **exact** conditions that cause sizes to vanish.

---

## 1. Data model (reference)

- **Backend:** `warehouse_products.size_kind` (`na` | `one_size` | `sized`). Per-warehouse quantities: `warehouse_inventory` (single qty) and `warehouse_inventory_by_size` (rows per size_code).
- **API/UI:** `sizeKind` + `quantityBySize: [{ sizeCode, quantity }, ...]`. Total stock = sum of `quantityBySize` when sized, else `quantity`.
- Sizes are **per warehouse**: list and update both use a `warehouse_id`; the list API returns sizes only for the requested warehouse.

---

## 2. Root causes (exact reasons sizes vanish)

### A. List requested with sentinel warehouse ID → API returns empty `quantityBySize`

**Where:** `InventoryContext.tsx` → `loadProducts()` uses `wid` for the GET request.

**Logic:**
- `effectiveWarehouseId` can be replaced by **sentinel** when "Main Store" is shown under a different name (e.g. "Main Town"):  
  `effectiveWarehouseId = isMainStoreIdWithWrongLabel ? SENTINEL_EMPTY_WAREHOUSE_ID : rawWarehouseId`
- `loadProducts` uses:  
  `wid = useSentinelForProductsRef.current ? SENTINEL_EMPTY_WAREHOUSE_ID : effectiveWarehouseIdRef.current`
- So when the UI shows "Main Town" (placeholder ID but label ≠ "main store"), **every list request** is sent with `warehouse_id = SENTINEL_EMPTY_WAREHOUSE_ID` (`00000000-0000-0000-0000-000000000099`).

**Backend:** `getWarehouseProducts(warehouseId, ...)`:
- Reads `warehouse_inventory_by_size` with `.eq('warehouse_id', effectiveWarehouseId)`.
- For the sentinel ID there are **no rows** (nobody writes to that fake warehouse).
- So `sizeMap` is empty → every product gets `quantityBySize: []` and `sizeKind` from `warehouse_products` (still `sized`), so the list returns **sized products with empty size rows**.

**Result:** After any refetch (realtime, poll, visibility, or post-save), the list is refetched with the sentinel → response has empty `quantityBySize` → state/cache is overwritten → **sizes appear to vanish**.

**Fix options:**
- For **post-save refetch only**, call `loadProducts` with the **same warehouse** used for the update (e.g. `effectiveWarehouseIdRef.current`) instead of `wid`, so the refetch is for the real warehouse and returns real sizes; **or**
- Avoid using the sentinel for the products list when the user is effectively viewing a single real warehouse (e.g. treat placeholder + "Main Town" as that warehouse for the list request).

---

### B. Offline list: Dexie → UI did not pass `sizeKind` / `quantityBySize` (FIXED)

**Where:** `src/hooks/useInventory.js` → `recordToProduct(record)`.

**Previously:** The function did not copy `sizeKind` or `quantityBySize` from the Dexie record. The list is driven by `offline.products` (Dexie → `recordToProduct`), so the UI always saw default/empty sizes.

**Now:** `recordToProduct` explicitly sets `sizeKind`, `quantityBySize`, and derives `quantity` from `quantityBySize` when `sizeKind === 'sized'`, so the offline list and cards show correct sizes and stock.

---

### C. Payload omitted `quantityBySize` → server could keep or clear sizes (FIXED)

**Where:** `InventoryContext.tsx` → `productToPayload()`.

**Previously:** `quantityBySize` was only added when `Array.isArray(product.quantityBySize) && product.quantityBySize.length > 0`. So when clearing sizes or "one size", the key was omitted; the server might then preserve old data or infer "no sizes" and overwrite.

**Now:** Payload always includes `quantityBySize: Array.isArray(product.quantityBySize) ? product.quantityBySize : []`, so the server always receives an explicit value and sizes do not revert due to a missing key.

---

### D. Cache key = `wid` → sentinel cache overwrites good data

**Where:** `InventoryContext.tsx` → `loadProducts()` → `cacheRef.current[wid] = { data: listToSet, ts }`.

**Logic:** Cache is keyed by the **request** warehouse id (`wid`), not `effectiveWarehouseId`. So when `wid` is the sentinel:
- The fetched list has empty `quantityBySize`.
- That list is stored in `cacheRef.current[sentinel]`.
- Later, cache merge uses `cached = cacheRef.current[wid].data`; if `wid` is still sentinel, the cache itself has empty sizes, so there is nothing to preserve.

So the **sentinel path** (A) and **cache key** (D) work together: once we’ve done one list request with sentinel, the cache for that “warehouse” is poisoned with empty sizes until we request again with the real warehouse.

---

### E. Merge prefers “current state” only when API returns synthetic one-size

**Where:** `InventoryContext.tsx` → `loadProducts()` → merge block using `currentForMerge` / `productsRef.current`.

**Logic:** We keep the current in-memory product (with real S/M/L) only when:
- The API product has `isOnlySyntheticOneSize(p.quantityBySize)` (single "ONESIZE" row), and  
- Current state has real sizes (`stateHasRealSizes`).

When the API returns **empty** `quantityBySize` (sentinel path), `isOnlySyntheticOneSize([])` is false (array length ≠ 1), so we **do not** substitute from state and we keep the API’s empty array. So again, the sentinel response wins and sizes vanish.

---

### F. Backend list: sizes are per warehouse

**Where:** `inventory-server/lib/data/warehouseProducts.ts` → `getWarehouseProducts(warehouseId, ...)`.

**Logic:** `sizeMap` is built only from `warehouse_inventory_by_size` with `.eq('warehouse_id', effectiveWarehouseId)`. So:
- Correct warehouse → sizes for that warehouse (or fallback size codes from other warehouses with 0 qty).
- Wrong or sentinel warehouse → no rows for that warehouse → empty `quantityBySize` (or fallback codes with 0 only).

So any **warehouse_id mismatch** (e.g. list for warehouse A, update for warehouse B, or list with sentinel) can make sizes appear to vanish for the list.

---

### G. Backend PUT response: `fetchOne` after RPC

**Where:** `inventory-server/app/api/products/[...id]/route.ts` → after `update_warehouse_product_atomic`, `fetchOne(db, id, wid)`.

**Logic:** The response is built from `fetchOne`, which reads `warehouse_inventory_by_size` for the **same** `wid` used in the update. If the RPC wrote `size_kind` but failed to write `warehouse_inventory_by_size` (e.g. constraint, trigger, or partial failure), `fetchOne` would still return `quantityBySize: []` and `sizeKind: 'sized'`. The client would then show “No sizes recorded” even though the user just saved sizes.

**Mitigation:** Ensure the RPC `update_warehouse_product_atomic` (and any manual fallback) writes both `warehouse_products.size_kind` and `warehouse_inventory_by_size` in one transaction and that errors are surfaced. If the PUT response has empty `quantityBySize` right after save, the bug is on the server (RPC or manual update).

---

## 3. Summary table

| # | Cause | Location | Status / Fix |
|---|--------|----------|--------------|
| A | List uses sentinel warehouse ID → API returns empty `quantityBySize` | `loadProducts` uses `wid` (sentinel when “Main Town”) | **Root cause** when that UI state is active; fix by not using sentinel for list or by refetching with real warehouse after update |
| B | Offline list: `recordToProduct` dropped sizes | `useInventory.js` | **Fixed** (sizes and quantity derived in `recordToProduct`) |
| C | Payload omitted `quantityBySize` | `productToPayload` | **Fixed** (always send array) |
| D | Cache keyed by `wid` → sentinel cache has empty sizes | `cacheRef.current[wid]` | Consequence of A; fix A to avoid poisoning cache |
| E | Merge does not replace empty API sizes from state | `currentForMerge` / `stateHasRealSizes` | Only substitutes for synthetic one-size; empty array from sentinel is kept |
| F | Backend list is per-warehouse | `getWarehouseProducts` | By design; wrong/sentinel warehouse → empty sizes |
| G | RPC/manual update might not write by_size | PUT handler + RPC | Verify RPC and error handling if PUT response has empty sizes after save |

---

## 4. Recommended next step

**Primary fix:** In `loadProducts`, when the call is a **post-save refetch** (`postSaveRefetch === true`), use the **real** warehouse id (e.g. `effectiveWarehouseIdRef.current`) for the request instead of `wid`, so the refetch after update is for the same warehouse that was updated and returns correct `quantityBySize`. That prevents the post-update refetch from overwriting good sizes with a sentinel (empty) response.

Optionally, also avoid using the sentinel for **any** products list request when the selected warehouse is effectively the placeholder (e.g. “Main Town” = same store as “Main Store”), so that normal polling and realtime refetches never replace sizes with an empty list.
