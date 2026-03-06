# Realtime Sync — Audit and Gap Analysis

This document answers the Claude prompt: **Phase 1 audit** of the current sync mechanism, then a **gap analysis** between what the prompt requires and what is already implemented, so we can confirm we are doing the right thing.

---

## PHASE 1 — CURRENT SYNC MECHANISM (POST-IMPLEMENTATION)

### 1. useRealtimeSync hook (still in codebase, **no longer used**)

**File:** `src/hooks/useRealtimeSync.ts`

- **Polling interval:** `DEFAULT_INTERVAL_MS = 60_000` (1 minute). Consumer could override (e.g. 15_000 was used in InventoryContext before we removed it).
- **What it fetches when it polls:** Nothing directly. It calls `onSync()`, which was `() => loadProducts(undefined, { silent: true, bypassCache: true })` — so it triggered a full product list refetch from the API.
- **Cleanup:** Yes. `return () => clearInterval(id)` runs on unmount or when `intervalMs`/`disabled` change.
- **WebSocket/Realtime:** None. Pure `setInterval` + callback. No cross-device push.

**Current usage:** **Zero.** InventoryContext no longer calls `useRealtimeSync`. The hook exists only for possible rollback.

---

### 2. InventoryContext — sync-related code

**File:** `src/contexts/InventoryContext.tsx`

- **How it refreshes product data:**  
  - **Primary:** Supabase Realtime via `useInventoryRealtime(effectiveWarehouseId)`. On `postgres_changes` for `warehouse_inventory_by_size`, `sales`, `warehouse_products` it **invalidates** React Query keys (`products`, `dashboard`, `posProducts`, `sales`, `reports`). React Query then refetches when those queries are next used.
  - **Fallback:** Tab visibility. `visibilitychange` → when tab becomes visible, calls `loadProductsRef.current(undefined, { silent: true, bypassCache: true })`.
- **What triggers a refresh:**  
  - Realtime event (any change to those tables for the warehouse).  
  - User focuses the tab (visibilitychange).  
  - User clicks Retry (circuit reset + refreshProducts).  
  - Mount / warehouse change (initial load + silent bypass cache).
- **Cross-device awareness:** Yes. Realtime is cross-device: a change on desktop triggers an event to all subscribed clients (including mobile), which then invalidate and refetch. Tab visibility is **same-device only** (only when *that* tab is focused).

---

### 3. POSPage — sync-related code

**File:** `src/pages/POSPage.tsx`

- **How it knows to refresh products:**  
  - It uses `products: inventoryProducts` from `useInventory()`. So the product list on POS is the same as InventoryContext’s `products`.  
  - When Realtime fires, InventoryContext invalidates `queryKeys.products(warehouseId)` and refetches. When the refetch completes, `inventoryProducts` updates, and the POS effect that depends on `inventoryProducts` and `warehouse.id` runs and calls `setProducts(inventoryProducts.map(productToPOSProduct))`. So POS **does** see inventory/stock changes from another device after Realtime + refetch.
  - It also has its own **visibility refetch:** when the tab becomes visible it clears `productsCacheRef` and calls `loadProducts(warehouse.id, true)`.
- **Response to inventory changes on another device:** Yes, via Realtime → invalidation → InventoryContext refetch → updated `inventoryProducts` → POS state update. No separate Realtime subscription on POSPage; it relies on the single subscription in InventoryContext.

---

### 4. Dashboard — sync-related code

**File:** `src/hooks/useDashboardQuery.ts` + `DashboardPage.tsx`

- **How it refreshes stats:** Uses React Query with `queryKeys.dashboard(warehouseId, today)` and `queryKeys.todayByWarehouse(today)`. `staleTime: 0` for dashboard so it refetches when the query is used/focused.
- **Response to sales on another device:** Yes. Realtime in InventoryContext invalidates `['dashboard', warehouseId]` on sales INSERT/UPDATE/DELETE and on inventory/product changes. Dashboard page refetches when that cache is invalidated. No polling; Realtime drives the refresh.

---

### 5. notifyInventoryUpdated — implementation

**File:** `inventory-server/lib/cache/dashboardStatsCache.ts`

- **What it is:** Server-side only. It deletes the **Redis** cache entry for that warehouse’s dashboard stats (`cacheKey(warehouseId)`). So the *next* GET `/api/dashboard` recomputes from the DB instead of returning cached stats.
- **Not** a CustomEvent, BroadcastChannel, or any client push. It does **not** push to browsers. It only invalidates server-side cache so the next client request gets fresh data.
- **Cross-device:** It does **not** by itself make another device’s UI update. Cross-device update happens because we now have **Realtime**: when a sale or inventory change is written to the DB, Supabase sends a postgres_changes event to all clients, and our hook invalidates dashboard/products; then clients refetch (and when they call GET dashboard, the server has already invalidated Redis so they get fresh data). So the combination “Realtime + notifyInventoryUpdated” is correct: Realtime notifies clients to refetch; Redis invalidation ensures the refetch gets fresh server data.

---

### 6. Tab visibility refetch — implementation

**Locations:**

- **InventoryContext:** `document.addEventListener('visibilitychange', onVisible)` → when `document.visibilityState === 'visible'`, calls `loadProductsRef.current(undefined, { silent: true, bypassCache: true })`.
- **POSPage:** Same idea; on visible it clears product cache and calls `loadProducts(warehouse.id, true)`.

**Cross-device:** No. Visibility only fires when **this** tab/window is focused. It does **not** fire when another device makes a change. It is a **fallback** for when the user returns to the app (e.g. after background) so we refetch in case we missed Realtime events while in the background.

---

### Confirmation (Phase 1 summary)

**The current sync mechanism is:**

- **Primary:** Supabase Realtime (WebSocket) in `useInventoryRealtime`. Subscriptions on `warehouse_inventory_by_size`, `sales`, `warehouse_products`. On any change we invalidate products, dashboard, posProducts, sales, reports. No polling for these data sets.
- **Fallback:** Tab visibility refetch (same device only, when user focuses the tab).

**It does push changes from desktop to mobile** (and vice versa) via Realtime: any client that has the channel subscribed gets the event and invalidates/refetches. Mobile does **not** need to poll or refresh manually to see desktop changes.

**Mobile sees changes when:** A Realtime event is received (typically within 1–2 seconds of the DB write), or when the user focuses the tab (visibility refetch). There is **no** 60-second polling anymore.

---

## PHASE 2 — REALTIME ENABLED IN SUPABASE

- You confirmed you turned on Realtime for the required tables in the Supabase Dashboard.
- Our code subscribes to: `warehouse_inventory_by_size`, `sales`, `warehouse_products`. The prompt also lists `warehouse_inventory`, `deliveries`, `orders`. We do **not** currently subscribe to `warehouse_inventory`, `deliveries`, or `orders` (see gaps below).
- **Recommendation:** Run the suggested SQL in the prompt to list `pg_publication_tables` for `supabase_realtime` and ensure at least `warehouse_inventory_by_size`, `sales`, `warehouse_products` are present. Add `warehouse_inventory`, `deliveries`, `orders` to the publication if those tables exist and you want Realtime for them.

---

## GAP ANALYSIS — What the prompt requires vs what we have

### Aligned with the prompt (we are doing the right thing)

| Requirement | Our implementation | Status |
|-------------|--------------------|--------|
| Use Supabase Realtime for instant push | `useInventoryRealtime` subscribes to postgres_changes, invalidates React Query | ✅ |
| No reliance on 60s polling for products/dashboard/sales | Polling removed; Realtime + visibility only | ✅ |
| Invalidate cache on change; refetch clean data (don’t trust payload) | We only invalidate; no use of event payload as source of truth | ✅ |
| Cleanup subscription on unmount / warehouse change | `return () => supabase.removeChannel(channel)` | ✅ |
| Tab visibility refetch as fallback | Kept in InventoryContext and POSPage | ✅ |
| Single Realtime hook used at provider level | One hook in InventoryContext; all pages that use products/dashboard/sales benefit | ✅ |
| notifyInventoryUpdated is server-side only | It’s Redis invalidation; we don’t rely on it for cross-device push; Realtime does that | ✅ |

---

### Gaps (prompt asks for more; not yet done)

| # | Prompt requirement | Current state | Recommendation |
|---|--------------------|---------------|----------------|
| 1 | **5-minute fallback poll** | We removed polling entirely. Prompt: keep Realtime as primary but add a 5‑minute poll as “belt and suspenders”. | Consider re-adding `useRealtimeSync` with `intervalMs: 300_000` and `onSync: () => loadProducts(..., { silent: true, bypassCache: true })` so if Realtime drops for a long time, we still refresh. |
| 2 | **Realtime on `warehouse_inventory`, `deliveries`, `orders`** | We only subscribe to `warehouse_inventory_by_size`, `sales`, `warehouse_products`. No deliveries/orders. | If the app has deliveries/orders lists that should update live, add postgres_changes for those tables and invalidate the relevant query keys (you’d add e.g. `queryKeys.deliveries(warehouseId)` if they use React Query). |
| 3 | **Realtime connection status indicator** (green/yellow/red in topbar) | We don’t expose or show Realtime status. No `useRealtimeStatus` or `RealtimeSyncIndicator`. | Add a small topbar indicator (e.g. “Live” / “Syncing…” / “Offline”) so cashiers know when they’re getting live updates. Requires subscribing to channel status in the Realtime hook and exposing it (context or hook return). |
| 4 | **Handle CHANNEL_ERROR / TIMED_OUT; 30s banner “Reconnecting…”** | We don’t track or display connection status. | Implement status in the Realtime hook and show the prompt’s behavior (yellow when reconnecting, banner after 30s). |
| 5 | **Visibility: full `queryClient.invalidateQueries()` on foreground** | We only call `loadProducts(..., { silent: true, bypassCache: true })`. We don’t invalidate dashboard, sales, etc. | Optionally on visibility → `queryClient.invalidateQueries()` (or invalidate the main keys) so every screen gets a fresh refetch when the user returns. |
| 6 | **Pre-sale stock check** (GET /api/products/verify-stock) | Not implemented. | Add endpoint and, before completing a sale, call it; if conflict, show “Stock has changed…” and block sale. Reduces risk of selling out-of-stock on stale mobile data. |
| 7 | **Charge button: loading for entire API call; 10s “Taking longer…” message** | Not verified in this audit. | Confirm the charge button stays in loading state until the server responds and add a “Taking longer than usual…” message after ~10s if needed. |
| 8 | **Mobile: reduce initial product load (e.g. 50), compression, lazy images, debounce search, double-tap guard** | We load up to 250 products; other items not verified. | Optional performance improvements per prompt (smaller first page on mobile, gzip, lazy images, debounce, double-tap prevention on charge). |

---

## Summary: Are we doing the right thing?

**Yes, for the core goal:** Desktop and mobile are kept in sync by **Supabase Realtime**, not by 60-second polling. Changes made on one device invalidate the right caches on all devices and trigger a refetch, so data is updated within a few seconds. Tab visibility refetch is a correct fallback when the user returns to the tab.

**What’s missing for full alignment with the prompt:**

1. **Resilience:** 5-minute fallback poll when Realtime is the primary.
2. **Visibility:** Realtime connection indicator (green/yellow/red) and optional full invalidate on foreground.
3. **Coverage:** Realtime for `deliveries` (and `orders` if used) if those UIs should update live.
4. **Safety:** Pre-sale stock verification endpoint and flow so mobile doesn’t sell out-of-stock.
5. **UX/reliability:** Explicit handling of Realtime disconnect/reconnect and charge-button loading/10s message.

Implementing the gaps in the order suggested by the prompt (Phase 3 then Phase 4) will bring the app to the “done” standard described there (e.g. indicator, no stale data >5s when connected, 7 test cases). The current implementation already achieves the critical requirement: **mobile reflects desktop changes via Realtime, not 60s polling.**
