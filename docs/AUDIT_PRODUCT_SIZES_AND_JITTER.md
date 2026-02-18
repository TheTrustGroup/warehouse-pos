# Audit: Product Sizes Column & List Jitter

## Scope
- Product **add** flow (form → payload → API → state)
- Product **edit** flow (form → payload → API → state)
- Product **list** (API → parse → normalize → cache merge → table)
- **Sizes** column visibility
- **Jitter** on auto-refresh (10s poll)

---

## 1. Add flow
- **Form** (`ProductFormModal`): Sends `sizeKind`, `quantityBySize` when "Multiple sizes" and valid size rows.
- **Payload** (`productToPayload`): Includes `sizeKind` and `quantityBySize` when present.
- **API**: POST to `/api/products` or `/admin/api/products`; backend writes `size_kind` and `warehouse_inventory_by_size`.
- **State after add**: `normalized` gets `quantityBySize` and `sizeKind` from `productData` so list shows sizes without refetch.
- **Verdict**: Add path is correct; sizes are sent and applied to state.

---

## 2. Edit flow
- **Form**: Pre-fills `quantityBySize` / `sizeKind` from `currentProduct`; sends them on submit.
- **Payload**: `updated = { ...product, ...updates }` then `productToPayload(updated)` so sizes are included.
- **State after update**: `finalProduct` gets `updates.quantityBySize` and `updates.sizeKind` so list shows sizes.
- **Verdict**: Edit path is correct.

---

## 3. List flow (GET)
- **Backend** (`getWarehouseProducts`): Selects `*` (includes `size_kind`), loads `bySizeMap` via `getQuantitiesBySizeForProducts`, fallback `getQuantitiesBySize` per sized product; `rowToApi(row, qty, quantityBySize)` sets `sizeKind` and `quantityBySize`.
- **Frontend**: `parseProductsResponse` (Zod) keeps `sizeKind` and `quantityBySize` (optional, passthrough). `normalizeProduct` keeps them when present and accepts `size_kind`. Cache merge preserves sizes from cache when API product has none.
- **Verdict**: List path is correct **if** backend returns sizes. If sizes still don’t show, check: (1) API response in Network tab for `sizeKind` / `quantityBySize`, (2) Supabase migrations for `warehouse_products.size_kind` and `warehouse_inventory_by_size`.

---

## 4. Sizes column (table)
- **Issue**: When `sizeKind === 'sized'` but `quantityBySize` was missing or `[]`, the code called `product.quantityBySize!.map(...)`, which could throw or render nothing.
- **Fix**: Render size pills only when `quantityBySize` has length; otherwise show "Sized". Handle `one_size` and "—" explicitly.

---

## 5. Jitter on auto-refresh
- **Causes**: (1) `setBackgroundRefreshing(true)` at start of every silent refresh caused an extra re-render. (2) Equivalence check was order-dependent: if the API returned the same products in a different order, we always called `setProducts`, so the list re-rendered every poll.
- **Fixes**: (1) For silent refresh, do **not** set `setBackgroundRefreshing(true)`; only set `false` in `finally`. (2) Treat list as equivalent by **id set + per-product data** (order-independent): same ids and same `updatedAt`, `quantity`, `sizeKind`, `quantityBySize` per id → skip `setProducts`.

---

## Files changed (surgical)
- `src/components/inventory/ProductTableView.tsx`: Sizes cell guards and "Sized" fallback.
- `src/contexts/InventoryContext.tsx`: Silent refresh no longer sets refreshing true; equivalence check is order-independent (by-id comparison).
