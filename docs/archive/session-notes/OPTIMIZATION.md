# Inventory & app load optimization

## What was fixed for inconsistent inventory loading

- **Cause**: "Failed to load resource: network connection was lost" on `GET /api/products` — a single failed attempt with no retry led to stuck "Loading..." and empty lists.
- **Changes**:
  1. **InventoryContext** – Products GET now uses `maxRetries: 3` (was 0). Transient network errors are retried with exponential backoff.
  2. **InventoryPage** – Product fetch uses `apiGet()` from `apiClient` with 3 retries and 20s timeout (replacing raw `fetch` with 8s timeout and no retries).
  3. **POSPage** – Product fetch also uses `apiGet()` with 3 retries and 20s timeout for consistent POS loading.

All product GETs now go through the shared client: retries, circuit breaker, and configurable timeout for more reliable loading.

---

## Implemented optimizations (from recommendations)

### 1. **Resilient client for all read-only calls**
- **SalesHistoryPage** – Sales list now uses `apiGet()` with 3 retries and 20s timeout (was raw `fetch`).
- **InventoryPage** – Size codes now use `apiGet()` with 2 retries and 10s timeout (was raw `apiFetch`).
- Products, sales, and size-codes all use the shared client for retries and circuit breaker.

### 2. **Stale-while-revalidate**
- **InventoryPage** – On load, reads from `localStorage` (key `warehouse_products_<warehouseId>`) and shows cached list immediately if present, then fetches from API and replaces. Cache is updated on every successful fetch. No loading spinner when cache is shown first.

### 3. **Smaller first request + offset**
- **Backend** – `GET /api/products` now accepts `offset`; `getWarehouseProducts` already supported it.
- **InventoryPage** – First request uses `limit=200` for fast first paint; if 200 items are returned, a second request fetches `offset=200&limit=800` in the background and merges. Full list appears without user action.
- **InventoryContext** – Same pattern: first request `limit=200`, then if full page, second request `offset=200&limit=800` and merge.

### 4. **Backend indexes**
- **Migration** – `002_warehouse_indexes.sql` adds indexes on `warehouse_inventory(warehouse_id)` and `warehouse_inventory_by_size(warehouse_id, product_id)`. Run after `001_complete_sql_fix.sql` for faster product list queries.

### 5. **Circuit breaker monitoring**
- When the circuit opens, the client logs: `[API] Circuit breaker opened — server temporarily unavailable...` so you can detect recurring API/network issues in the console.

---

## Optional next steps

- **Timeouts** – Product calls use 20s; increase to 25–30s for products only if you still see timeouts on slow networks.
- **Response size** – Avoid huge base64 images in list payloads; use URLs or a thumbnails endpoint if needed.
