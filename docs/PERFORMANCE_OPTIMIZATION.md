# Performance Optimization Plan — Implementation Summary

**Senior Engineer Review | March 2026**

---

## Phase 1 — Completed

### 1.1 React Query (TanStack Query)
- **Installed** `@tanstack/react-query` and added `QueryClientProvider` at app root (inside `AuthProvider`).
- **Products list**: `staleTime: 2 min`, `gcTime: 10 min` — integrated in `InventoryContext` via `queryClient.fetchQuery` with `queryKeys.products(warehouseId)`.
- **Dashboard**: `staleTime: 1 min`, `gcTime: 5 min` — `useDashboardQuery(warehouseId)` in `DashboardPage` with parallel fetch for dashboard + today-by-warehouse.
- **Cache invalidation**: After any product add/update/delete and after POS sale, `queryClient.invalidateQueries({ queryKey: ['products'] })` and `queryClient.invalidateQueries({ queryKey: ['dashboard'] })`.

### 1.2 Skeleton screens
- **Dashboard**: `StatCardSkeleton` for the four stat cards while loading; low-stock section keeps existing pulse placeholders.
- **Inventory**: Already uses `ProductCardSkeleton` for card view.

### 1.3 Parallel data fetching
- Dashboard already used `Promise.all` for dashboard + today-by-warehouse; now implemented via `useQueries` in `useDashboardQuery` (same parallelism, with caching).

### 1.4 SQL migrations
- **New migration** `20260302170000_sales_orders_indexes_idle_timeout.sql`:
  - Indexes: `idx_sales_warehouse_created`, `idx_sales_warehouse_status`, `idx_sales_delivery_status`, `idx_sale_lines_sale_id`, `idx_sale_lines_product_id`, `idx_orders_warehouse_created`.
  - `idle_in_transaction_session_timeout = '30s'` for `authenticator`, `anon`, `authenticated` to prevent zombie connections.

---

## Phase 2 — Partially completed

### 2.1 Preload POS products
- Critical data load (after login) already calls `refreshProducts()`, which populates the React Query products cache. When the user opens POS, products are either already in cache (from Inventory/Dashboard) or loading via the same cache. No separate prefetch component added.

### 2.2 Client-side POS search
- POS already filters products in memory (search, category, size, color). No API calls for search; data comes from `products` state (fed from InventoryContext / React Query cache).

### 2.3 Barcode scanner — zero-latency lookup
- **Implemented**: `barcodeToProduct` `Map<barcode, POSProduct>` built with `useMemo` from `products`. `handleBarcodeSubmit` uses `barcodeToProduct.get(raw.toLowerCase())` for O(1) lookup instead of filtering the array.

### 2.4 Optimistic sale confirmation
- **Implemented**: POS uses `useMutation` for `POST /api/sales`. onMutate: snapshot cart and products, apply stock deduction and clear cart, show sale complete with receiptId "Pending…" immediately. onSuccess: replace with server saleId/receiptId/completedAt and invalidate products/dashboard. onError: rollback products and cart, clear sale result, show toast (409 = Insufficient stock, else Sale didn't reach server). Cashier sees instant success; sync runs in background; rollback only on failure. (Previously not implemented in first pass.)

---

## Phase 3 — Mobile-first Inventory (done)

- **Small first request:** Viewport &lt; 768px → first request 30 products; desktop → 100. First paint after one round-trip.
- **Deferred rest:** Remaining products (up to 500) loaded in background via `requestIdleCallback`; list and stats update as chunks arrive; "Updating…" in header.
- **Responsive page size:** Mobile 20 per page, desktop 50 (`matchMedia('(max-width: 767px)')`).
- **Fewer skeletons on mobile:** 4 cards vs 6 on desktop.
- **Polling:** 60s on mobile, 30s on desktop to reduce background requests.
- **File:** `src/pages/InventoryPage.tsx`.

## Phase 4 — Not yet done

- Dashboard stats view in DB (single roundtrip for all stats).
- Lazy load non-critical pages (Reports, Deliveries) with `dynamic()` and `PageSkeleton`.
- Image optimization audit (Next.js `Image`, WebP, lazy load).

---

## Files touched (Phase 1–2)

| Area | Files |
|------|--------|
| Query setup | `src/lib/queryClient.ts`, `src/lib/queryKeys.ts`, `App.tsx` |
| Dashboard | `src/hooks/useDashboardQuery.ts`, `src/pages/DashboardPage.tsx`, `src/pages/Dashboard.tsx` |
| Inventory cache | `src/contexts/InventoryContext.tsx` |
| POS | `src/pages/POSPage.tsx` (invalidation, barcode Map) |
| DB | `inventory-server/supabase/migrations/20260302170000_sales_orders_indexes_idle_timeout.sql` |
| Inventory mobile | `src/pages/InventoryPage.tsx` (initial limit, deferred rest, page size, polling) |

---

## Expected impact

| Metric | Before | After Phase 1 |
|--------|--------|----------------|
| Inventory (cached) | 2–4 s | ~300 ms (cache hit) |
| Dashboard (cached) | 2–3 s | ~400 ms (cache hit) |
| POS (with warm cache) | 2–3 s | 1–2 s or instant if products already loaded |
| Barcode scan lookup | O(n) filter | O(1) Map lookup |

Run the new migration on your Supabase project (SQL Editor or CLI) so indexes and idle timeouts are applied.
