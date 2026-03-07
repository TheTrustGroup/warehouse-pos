# Data Architecture — Warehouse POS (New)

**Contract for the data-layer refactor.**  
Both warehouses have real UUIDs. Sentinel (099) and placeholder (001) special-casing are removed. Main Town empty = correct empty state.

---

## Section 1 — Warehouse identity (the new way)

### Single source of truth

**user_scopes table → warehouse_id column**

Resolution chain (simplified):

1. User logs in.
2. Server resolves session (Supabase JWT or app session JWT).
3. Server queries **user_scopes** by user identity (e.g. user_email or user_id, consistent with schema).
4. Server returns **warehouse_id** (real UUID) in login response and/or GET /api/auth/user.
5. Frontend stores it as **currentWarehouseId**.
6. All API calls use **currentWarehouseId**.
7. No fallback. No sentinel. No label check.

### If user has no scope

- Return error: *"No warehouse assigned to this user. Contact your administrator."*
- Do **not** fall back to any default warehouse.
- Do **not** use 001 as a fallback.
- Do not use ALLOWED_WAREHOUSE_IDS as a default for scoped users; only for unscoped admin if at all.

### Single frontend variable

**currentWarehouseId: string**

- This is the **only** warehouse ID variable on the frontend.
- It comes from **user_scopes** (via server auth response).
- It is never derived from labels or names.
- It is never a sentinel value.
- It is never 099.
- It may be 001 — that is Main Store’s real ID when 001 is Main Store’s UUID in the DB.

---

## Section 2 — What gets deleted

These are removed entirely:

| Item | Action |
|------|--------|
| **SENTINEL_EMPTY_WAREHOUSE_ID (099)** | Delete constant and all usages. Never use again. |
| **PLACEHOLDER_WAREHOUSE_ID (001)** | Not special. Just Main Store’s ID. Delete constant; use actual UUID from API. |
| **isMainStoreIdWithWrongLabel** | Delete flag and all logic. Fix ID resolution; label is irrelevant. |
| **rawWarehouseId** | Delete. Only currentWarehouseId exists. |
| **effectiveWarehouseId** | Delete. Only currentWarehouseId exists. |
| **useSentinelForProductsRef** | Delete. |
| **rawWarehouseIdRef** | Delete. |
| **dataWarehouseId / getDataWarehouseId()** | Delete. Only currentWarehouseId exists. |
| All conditional logic that checks “current warehouse ID is placeholder” and swaps it | Delete. |

---

## Section 3 — Single cache layer

**React Query is the only client-side cache for product/list data.**

### Removed

- **cacheRef** (in-memory object in context).
- **localStorage** key `warehouse_products_${id}` for product list.
- **IndexedDB/Dexie** product storage for list/catalog.  
  (Keep IndexedDB for offline sale queue / POS event queue only if required.)
- **Context state** holding the array of products.  
  (Context may still provide the hook and wiring; data lives in React Query.)

### React Query config

- **staleTime:** 60_000 (1 minute).
- **gcTime:** 300_000 (5 minutes in memory).
- **retry:** 2 (on failure).

### Query key structure

- **products:** `['products', warehouseId, filters]`
- **product:** `['product', productId]`
- **dashboard:** `['dashboard', warehouseId]`
- **sales:** `['sales', warehouseId, filters]`
- **deliveries:** `['deliveries', warehouseId]`

### On change (mutation or realtime)

- Invalidate the specific query key.
- React Query refetches.
- All components using that key update.
- Single source of truth; no manual sync.

---

## Section 4 — Warehouse isolation

Three layers; all must hold.

### Layer 1 — Database (RLS)

- Already in place.
- service_role used by API only.
- anon/authenticated get zero rows where appropriate.

### Layer 2 — API (per-request validation)

Every data endpoint:

1. Extract **warehouse_id** from request (query or body).
2. Resolve user’s allowed warehouses (e.g. getScopeForUser).
3. If requested warehouse_id is not in user’s scope → **403**.
4. All queries filter by that warehouse_id.

- No endpoint returns data across warehouses.
- No endpoint has a fallback warehouse.

### Layer 3 — Frontend (query key isolation)

- Query keys **always** include warehouseId.
- Main Store: `['products', 'UUID-A']`.
- Main Town: `['products', 'UUID-B']`.
- They never mix. A component showing Main Town never reads Main Store’s cache entry.

---

## Section 5 — Product data flow (the new way)

**Old flow (removed):** 10 steps, 5 bug points, sentinel/raw/effective, 6 caches, context state.

**New flow (4 steps, 0 bug points):**

1. **Page mount**  
   `useCurrentWarehouse()` → **currentWarehouseId** (real UUID). If not available → loading or error; no request with wrong ID.

2. **Data fetch**  
   `useProducts(currentWarehouseId)`  
   - React Query checks cache.  
   - If stale/missing: `GET /api/products?warehouse_id={currentWarehouseId}`.  
   - API queries DB with that UUID.  
   - Returns products with **quantityBySize** (computed in SQL, not JS).

3. **Cache**  
   Result stored under `['products', currentWarehouseId]`.  
   Nothing else stores product list data.

4. **Render**  
   ProductCard reads from React Query data.  
   Shows quantityBySize from API.  
   No transformation, no merging, no override.

---

## Section 6 — Backend query (fixed)

Current backend can exclude products that have only **warehouse_inventory_by_size** rows (no warehouse_inventory row) or when sizes query fails. New query uses **LEFT JOIN** and builds **quantityBySize** in SQL so all products for the warehouse are returned with correct sizes.

**If warehouse_products has warehouse_id** (one row per product per warehouse):

```sql
SELECT 
  wp.id,
  wp.name,
  wp.warehouse_id,
  wp.sku,
  wp.barcode,
  wp.category,
  wp.color,
  wp.cost_price,
  wp.selling_price,
  wp.images,
  wp.is_active,
  wp.created_at,
  wp.updated_at,
  COALESCE(
    jsonb_object_agg(
      wis.size_code, wis.quantity::int
    ) FILTER (WHERE wis.size_code IS NOT NULL),
    '{}'::jsonb
  ) AS quantity_by_size,
  COALESCE(SUM(wis.quantity), 0)::int AS total_quantity
FROM warehouse_products wp
LEFT JOIN warehouse_inventory_by_size wis
  ON wis.product_id = wp.id
  AND wis.warehouse_id = wp.warehouse_id
WHERE wp.warehouse_id = $warehouseId
  AND (wp.is_deleted IS NULL OR wp.is_deleted = false)
GROUP BY wp.id
ORDER BY wp.name ASC
LIMIT $limit OFFSET $offset;
```

**If warehouse_products has no warehouse_id** (one row per product globally; inventory per warehouse in warehouse_inventory / warehouse_inventory_by_size), use:

- FROM warehouse_products wp (no warehouse_id on wp).
- LEFT JOIN warehouse_inventory_by_size wis ON wis.product_id = wp.id AND wis.warehouse_id = $warehouseId.
- Restrict to products that have at least one row in wis for this warehouse, or include all products and show zeros where no sizes (product list shape stays the same; quantityBySize and total_quantity from the LEFT JOIN).
- Count query: same warehouse filter applied only via the join.

This single query replaces:

- The main sizes query.
- Conditional fallback query.
- size_codes join that can fail.
- Post-fetch JS size mapping.
- Any isMainStoreIdWithWrongLabel size fix.

---

## Section 7 — Realtime sync

**useWarehouseRealtime(currentWarehouseId)**

- Subscribes to:
  - **warehouse_products** WHERE warehouse_id = currentWarehouseId (or global table + filter by warehouse in payload).
  - **warehouse_inventory_by_size** WHERE warehouse_id = currentWarehouseId.
  - **sales** WHERE warehouse_id = currentWarehouseId.

- On any change:  
  `queryClient.invalidateQueries({ queryKey: ['products', currentWarehouseId] })` (and dashboard/sales as needed).

- Result: all devices showing this warehouse get fresh data in 1–3 seconds. No polling, no sentinel, no wrong ID.

---

## Section 8 — Migration plan

Phases in order:

| Phase | Action |
|-------|--------|
| **Phase 3** | Fix data root cause. Identify why Main Town user gets 001. Fix user_scopes or auth resolution. Verify each user resolves to correct warehouse UUID. No new features; only fix resolution. |
| **Phase 4** | Fix backend query. Replace INNER JOIN with LEFT JOIN; add jsonb_object_agg for quantityBySize; remove fallback query logic. Deploy. Confirm Amiri shows EU40:8. |
| **Phase 5** | Add **useCurrentWarehouse** hook. Single hook, real UUID only. Every page uses it. Guard component for loading state. **DONE:** `useCurrentWarehouse()` and `CurrentWarehouseGuard` in `WarehouseContext.tsx`. |
| **Phase 6** | Replace InventoryContext data layer. Remove 6 caches → React Query only. Remove all sentinel/placeholder logic and extra warehouse ID variables. **Part 1 DONE:** Single warehouse ID only in InventoryContext (removed SENTINEL_EMPTY_WAREHOUSE_ID, PLACEHOLDER check, isMainStoreIdWithWrongLabel, rawWarehouseId, effectiveWarehouseId, dataWarehouseId, getDataWarehouseId, and related refs). **Part 2 DONE:** React Query is the only cache; removed cacheRef, productsCacheKey, getCachedProductsForWarehouse, localStorage product list read/write; products from useQuery; refreshProducts/realtime/visibility/circuit-retry use invalidateQueries; add/update/delete/loadMore use setQueryData; mount effect no longer calls loadProducts. |
| **Phase 7** | Wire Realtime to real IDs. useWarehouseRealtime(currentWarehouseId). Remove sentinel subscription. |
| **Phase 8** | Delete dead code. Remove SENTINEL_EMPTY_WAREHOUSE_ID, PLACEHOLDER_WAREHOUSE_ID, isMainStoreIdWithWrongLabel, rawWarehouseId, effectiveWarehouseId, cacheRef, localStorage product cache, conditional fallback queries. |

---

## Section 9 — Canonical product type

Single **Product** type used everywhere. API returns it; UI reads it; no extra mapping.

```ts
interface Product {
  id:              string;
  warehouseId:     string;
  name:            string;
  sku:             string | null;
  barcode:         string | null;
  category:        string;
  color:           string;
  costPrice:       number;
  sellingPrice:    number;
  images:          string[];
  isActive:        boolean;
  totalQuantity:   number;   // SUM of sizes, always
  quantityBySize:  Record<string, number>;
  createdAt:       string;
  updatedAt:       string;
}
```

**quantityBySize example:** `{ "EU38": 3, "EU39": 5, "EU40": 8, "EU41": 2 }`

**totalQuantity** is always: `Object.values(quantityBySize).reduce((a, b) => a + b, 0)`.

- DB/trigger keeps it in sync where applicable.
- API query can compute it from sizes.
- UI does not store or recompute it; it uses API value.

---

## After this document

- **Phase 3** starts only after this architecture is approved.
- Phase 3 first action: confirm the hypothesis (why Main Town user gets 001) using SQL results and auth/session code — see **docs/INVESTIGATION_MAIN_TOWN_WAREHOUSE_ID.md**.
- First code fix: correct the root cause of wrong ID resolution. Then remove sentinel usage, then backend query fix, then React Query migration.
- This document is the contract; the refactor implements it. Nothing happens outside the document.
