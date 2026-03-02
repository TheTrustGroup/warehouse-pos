# Approach: Full Offline System with Sync When Server Is Back

**Status:** Implemented (Phase 1 + Phase 2). See `SERVER_OFFLINE_AND_STABILITY.md` for env and behavior.

**Goal:** When the server is down, the app still works (view products, add/edit products, complete sales). When the server is back, all data syncs automatically. No confusion, no breaking changes.

**Principles:**
1. **Reuse what exists** — Product sync (IndexedDB + queue) is already built; turn it on and mirror the same pattern for sales.
2. **One mental model** — "Write locally → sync when online" for both products and sales.
3. **Minimal surface area** — No big refactors. Add a small sales queue + sync loop; keep API contracts and idempotency as-is.
4. **Clear behavior** — Same rules for products and sales: offline = local write + queue; online = sync runs (and we still do direct API when online for sales so receipt has server id immediately).

---

## Current State (Summary)

| Area | Offline today? | Sync when back? | Notes |
|------|----------------|-----------------|--------|
| **Products** | Only if `VITE_OFFLINE_ENABLED=true` | Yes (SyncService) | Flag off by default |
| **Product list when API fails** | Yes (cache fallback) | N/A | Already in loadProducts catch |
| **POS (sales)** | No — Complete disabled when offline | No | No queue in code |
| **Orders** | No (read-only when offline) | No | Out of scope for this approach |
| **Server /api/sales** | — | — | Already has Idempotency-Key support |

---

## Three Phases (In Order)

### Phase 1 — Products: Default to offline-on

**What:** Make the product offline path the default so "server down" doesn’t block inventory.

**How:**
1. **Enable the flag by default**  
   Set `VITE_OFFLINE_ENABLED=true` in `.env.example` and in the deployment env (e.g. Vercel). No code change to logic; just configuration.
2. **Optional: cache fallback when offline from first load**  
   When `loadProducts` is called and we know we’re offline (e.g. `!navigator.onLine` or circuit open), short-circuit the API call and set products from:
   - `getCachedProductsForWarehouse(wid)` (localStorage), **or**
   - When offline flag is on, from IndexedDB/Dexie if we have a "last mirror" there.  
   This way, if the user opens the app while the server is down but had a previous session, they still see the last product list.  
   **Small code change:** at the start of `loadProducts`, if offline (and optionally circuit open), call the same fallback logic that the catch block uses (get cache, setProducts, setError to a short "Offline — showing last saved data" message), then return. No new APIs, no new stores.
3. **Docs**  
   In `SERVER_OFFLINE_AND_STABILITY.md` (or one "Offline & sync" doc), state clearly: "Products are offline-first when `VITE_OFFLINE_ENABLED=true` (default). Add/edit are saved locally and synced when the server is back."

**Risks:** None if we only flip the flag and add the optional cache short-circuit. Existing SyncService and conflict handling stay as-is.

---

### Phase 2 — POS: Offline queue + sync when back

**What:** When the user is offline, "Complete sale" is allowed: the sale is stored locally and synced when the server is back. When online, keep current behavior (POST to API directly so the receipt has server id immediately).

**Design:**
- **Online:** Unchanged. User taps Complete → `POST /api/sales` with `Idempotency-Key` → success → clear cart, show receipt with server `id` / `receiptId`.
- **Offline:** User taps Complete → enqueue sale to IndexedDB (`pos_event_queue`) with a stable `event_id` (UUID) → clear cart, show success screen with "Will sync when online" (and optional local receipt id). When the server is back, a sync process sends each pending event as `POST /api/sales` with `Idempotency-Key: event_id`. Server already returns 200 with cached body on replay.

**Implementation (minimal):**

1. **Use existing `pos_event_queue` in `offlineDb.ts`**  
   Schema already exists (keyPath `event_id`, indexes `by_status`, `by_created_at`). Add helpers:
   - `enqueueSaleEvent(payload, eventId?)` — append one event (status `pending`, `created_at`).
   - `getPendingSaleEvents()` — return events with status `pending`, ordered by `created_at`.
   - `markSaleEventSynced(event_id)` or delete the event after success.
   - `markSaleEventFailed(event_id, reason?)` for 409 / permanent failure (optional; can still delete and show in UI).

2. **POS page: two paths in `handleCharge`**
   - If **online** (`navigator.onLine` and optionally `isServerReachable` or no circuit): current behavior — `POST /api/sales`, then clear cart and show receipt. No queue.
   - If **offline**: generate `event_id = uuid()`, build same payload as today, call `enqueueSaleEvent(payload, event_id)`, apply same optimistic product deduction (so POS list stays consistent), clear cart, show success screen with copy like "Sale saved locally. Will sync when connection is back." No API call.

3. **Sales sync loop (new small module)**
   - New file, e.g. `src/services/salesSyncService.ts` (or `.js`):  
     - `processSalesSyncQueue()`: if not online, return. Read `getPendingSaleEvents()`, for each event `POST /api/sales` with body = event payload and header `Idempotency-Key: event.event_id`. On 2xx: mark synced (or delete). On 409 (e.g. insufficient stock): mark failed (or delete) and optionally surface in UI. On 5xx/network: leave pending for next run.
   - No retry complexity needed in v1: on "back online" we run once; optional periodic run (e.g. every 30s) when online.

4. **Trigger sales sync when back online**
   - In `NetworkStatusContext`, when transitioning from offline to online, after (or alongside) `syncService.processSyncQueue()`, call `salesSyncService.processSalesSyncQueue()` (or equivalent). No need to gate by product offline flag: sales sync is independent and safe (idempotent).

5. **UI**
   - Offline: allow "Complete sale" (remove or relax the read-only guard for POS when offline).
   - Optional: in header or SyncStatusBar, show "Pending sales: N" when there are pending sale events, and "Syncing sales…" while `processSalesSyncQueue` is running.

**What we don’t do:**
- Don’t change `POST /api/sales` contract.
- Don’t add a second idempotency mechanism — reuse existing `Idempotency-Key` and server cache.
- Don’t mix product sync and sales sync logic; keep `syncService.js` for products only and add a thin sales sync module.

**Risks:** Low. Server already supports idempotency; we only add a client queue and a single sync function.

---

### Phase 3 — Optional: First load when server is down

**What:** If the user has never loaded the app while online, we currently have no cache. Phase 3 would allow "open app while server is down and still see something useful."

**Options:**
- **A.** Persist stores/warehouses in IndexedDB or localStorage after first successful load; on next app open, if server unreachable, restore scope and show cached products (same cache we already use in loadProducts catch). So "first load ever" still needs network; "first load after a previous good session" works offline.
- **B.** Leave as-is: require at least one successful load when online; after that, cache + product sync + sales sync cover offline.

**Recommendation:** Skip Phase 3 in the first cut. Document: "Use the app once while online so data can sync; after that you can work offline." Add Phase 3 only if you need true "cold start" offline.

---

## Order of Implementation

1. **Phase 1** — Set `VITE_OFFLINE_ENABLED=true`, add optional offline short-circuit in `loadProducts`, update docs.  
2. **Phase 2** — Add `pos_event_queue` helpers in `offlineDb`, add `salesSyncService`, wire POS `handleCharge` (offline path), wire "back online" to run sales sync, allow Complete sale when offline, optional "Pending sales" UI.  
3. **Phase 3** (if needed) — Persist scope + cache and restore on load when server unreachable.

---

## How This Avoids Confusion and Breakage

- **One rule:** "If it’s a write (product add/edit, sale), it goes to local storage + queue when offline; when online, sync runs (and for sales we also allow direct POST when online for instant receipt)."
- **No dual sources of truth:** Server remains source of truth after sync; local state is "pending" until sync succeeds.
- **No API changes:** Same endpoints, same idempotency; we only add client-side queue and sync.
- **Feature flag only for products:** Sales sync can always run when online; product offline is still gated by `VITE_OFFLINE_ENABLED` so existing deployments that rely on "API-only" products are unchanged until they set the flag.

---

## Files to Touch (Summary)

| Phase | Files |
|-------|--------|
| **1** | `.env.example`, deployment env, `InventoryContext.tsx` (optional offline short-circuit in loadProducts), `SERVER_OFFLINE_AND_STABILITY.md` or new Offline doc |
| **2** | `src/lib/offlineDb.ts` (pos_event_queue helpers), new `src/services/salesSyncService.ts` (or .js), `src/contexts/NetworkStatusContext.tsx` (call sales sync on online), `src/pages/POSPage.tsx` (handleCharge offline path + allow Complete when offline), optional: SyncStatusBar / POS header for pending count |
| **3** | Scope persistence + load path when server unreachable (only if needed) |

This is the approach to achieve an offline-capable app with sync when the server is back, without complicating or breaking the current system.
