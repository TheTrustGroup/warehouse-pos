# Cross-device sync audit: product sizes and single source of truth

**Purpose:** Ensure product updates (especially sizes) are stored once, returned correctly by the API, and shown consistently on all devices (mobile, desktop, other tabs).

---

## 1. Source of truth

- **Server (API + DB)** is the single source of truth. Local storage and IndexedDB are cache only.
- **Success** is only shown after the PUT request returns 2xx. No optimistic "saved" before server confirmation.
- After a successful update, the client refetches the product list with `bypassCache: true` so this device and others see the same data on next load or poll.

---

## 2. Why sizes showed on mobile but 0 on desktop

- **Root cause 1:** `getProductById` (used for PUT response and GET single product) queried `warehouse_inventory_by_size` with a join on `size_codes!left(size_label)`. If that relation is missing or errors (e.g. schema difference), the query can fail or return no rows, so the API returned `quantityBySize: []` and total quantity from `warehouse_inventory` only. Desktop refetches from API and showed that; mobile might still show form/cache.
- **Fix:** In `inventory-server/lib/data/warehouseProducts.ts`, `getProductById` now catches by_size query errors (e.g. relation/size_codes) and falls back to a simple `select('size_code, quantity')` so sizes are always returned when present in `warehouse_inventory_by_size`.

- **Root cause 2:** No refetch after update, so the updating device kept local state while other devices only got new data on the 30s poll. If the API had returned wrong data, desktop would eventually show 0.
- **Fix:** After a successful product update, the client calls `refreshProducts({ bypassCache: true })` so the list is re-fetched from the server and all tabs on this device see server state; other devices see it on their next poll (30s) or when they open/refocus.

---

## 3. Stored successfully, not false

- **PUT /api/products** (body with id, warehouseId, quantityBySize, sizeKind) calls `updateWarehouseProduct`, which:
  1. Updates `warehouse_products` (including `size_kind`).
  2. Deletes then re-inserts `warehouse_inventory` and `warehouse_inventory_by_size` for that product/warehouse.
  3. Returns the updated product via `getProductById(warehouseId, productId)` so the response reflects what was written.
- The client only shows "Product updated" after the PUT resolves successfully. It then refetches so the list matches what is stored.
- If PUT fails (4xx/5xx), the client shows an error and does not update local state with the failed payload.

---

## 4. Data flow summary

| Step | What happens |
|------|----------------|
| User saves product with sizes | Client sends PUT with `quantityBySize`, `sizeKind`, `warehouseId`. |
| Server | `updateWarehouseProduct` writes to `warehouse_products`, `warehouse_inventory`, `warehouse_inventory_by_size`. |
| Response | Server returns product from `getProductById` (with fallback so by_size rows always returned when they exist). |
| Client | Updates state from response, writes cache, shows "Product updated.", then calls `refreshProducts({ bypassCache: true })`. |
| Refetch | `loadProducts(..., { bypassCache: true })` runs; GET /api/products returns list with sizes from `warehouse_inventory_by_size`. |
| Other devices | See updated data on next 30s poll or when they refocus the tab (visibility refetch). |

---

## 5. Files touched

- `inventory-server/lib/data/warehouseProducts.ts`: `getProductById` fallback when by_size join fails.
- `src/contexts/InventoryContext.tsx`: After successful update, call `refreshProducts({ bypassCache: true })` so list is server truth.
