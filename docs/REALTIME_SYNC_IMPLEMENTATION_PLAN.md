# Supabase Realtime Sync — Implementation Plan

Replace the current **polling-based** sync (`useRealtimeSync` every 15–60s) with **Supabase Realtime** so stock and sales changes appear on all connected devices within 1–2 seconds.

---

## 1. Current State (to change)

| Item | Location | Behavior |
|------|----------|----------|
| Polling | `src/hooks/useRealtimeSync.ts` | `setInterval(tick, intervalMs)` (e.g. 15_000 ms). |
| Consumer | `src/contexts/InventoryContext.tsx` | `useRealtimeSync({ onSync: () => loadProducts(..., { silent: true, bypassCache: true }), intervalMs: INVENTORY_POLL_MS })`. |
| Tab visibility | `InventoryContext.tsx` | `visibilitychange` → `loadProducts(..., { silent: true, bypassCache: true })`. |
| Supabase on frontend | N/A | Frontend has **no** Supabase client; it only calls the Next.js API (`API_BASE_URL`). |

**Query keys in use:** `queryKeys.products(wid)`, `queryKeys.dashboard(wid, date)`, `queryKeys.todayByWarehouse(date)`, `queryKeys.sales(wid, params)`, `queryKeys.posProducts(wid)`. Reports page does not use React Query (fetches on demand).

---

## 2. Target Behavior

- Any change to **inventory** or **sales** for a warehouse appears on all connected clients in **1–2 seconds**.
- **No polling** for realtime; only Realtime subscriptions.
- **Tab visibility refetch** kept as a **fallback** when the WebSocket disconnects or the user returns to the tab.

---

## 3. Implementation Steps

### 3.1 Add Supabase client to the frontend

- **Add dependency:** In `warehouse-pos/package.json`, add `@supabase/supabase-js` (align version with `inventory-server` if desired, e.g. `^2.47.10`).
- **Env:** Frontend needs **read-only** access to Realtime (and optionally Postgres for Realtime). Use:
  - `VITE_SUPABASE_URL` — project URL (e.g. `https://xxx.supabase.co`).
  - `VITE_SUPABASE_ANON_KEY` — anon/public key (safe to expose; RLS and Realtime filters limit what clients see).
- **Create client:** New file e.g. `src/lib/supabase.ts`:
  - `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`.
  - Export a singleton or a `getSupabaseClient()` so the same client is used for all Realtime channels.
- **Docs:** In `docs/` or README, note that Realtime requires these env vars and that Replication must be enabled for the tables (see 3.5).

### 3.2 Create `useInventoryRealtime(warehouseId)`

- **New file:** `src/hooks/useInventoryRealtime.ts`.
- **Signature:** `useInventoryRealtime(warehouseId: string | null | undefined): void`.
- **Behavior:**
  - If `warehouseId` is null/undefined or invalid, do not subscribe; return.
  - Create a single channel per warehouse: `supabase.channel('warehouse-inventory-' + warehouseId)`.
  - Subscribe to **postgres_changes** for:
    1. **`warehouse_inventory_by_size`**  
       - `schema: 'public'`, `table: 'warehouse_inventory_by_size'`, `event: '*'` (INSERT, UPDATE, DELETE).  
       - `filter: 'warehouse_id=eq.' + warehouseId`.
    2. **`sales`**  
       - `schema: 'public'`, `table: 'sales'`, `event: 'INSERT'` (and optionally UPDATE/DELETE if you care about void/updates).  
       - `filter: 'warehouse_id=eq.' + warehouseId`.
    3. **`warehouse_products`**  
       - **Schema note:** The codebase suggests `warehouse_products` may not have a `warehouse_id` column. If it does not, subscribe **without** a filter and invalidate product (and dashboard) caches for the **current** warehouse only (or all product keys if you prefer). If it does have `warehouse_id`, use `filter: 'warehouse_id=eq.' + warehouseId`.
  - On each event: **do not** use the event payload as source of truth (payload can be partial). Only **invalidate** React Query caches so the app refetches clean data:
    - **warehouse_inventory_by_size:**  
      `queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) })`,  
      `queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, …) })`,  
      and optionally `queryKeys.posProducts(warehouseId)` if used.
    - **sales:**  
      `queryClient.invalidateQueries({ queryKey: queryKeys.sales(warehouseId, …) })` (or partial `['sales', warehouseId]`),  
      `queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, …) })`,  
      `queryClient.invalidateQueries({ queryKey: ['reports'] })` (or add `queryKeys.reports(warehouseId)` and use it for future reports caching).
    - **warehouse_products:**  
      Same as inventory: products + dashboard (and posProducts if applicable).
  - **Cleanup:** In the effect’s return, call `supabase.removeChannel(channel)` so the channel is always removed on unmount or when `warehouseId` changes.
  - Use `useQueryClient()` inside the hook to get `queryClient`; keep the hook free of direct refetch logic (invalidate only).

### 3.3 Subscribe pattern (reference)

```ts
const channel = supabase
  .channel('warehouse-inventory-' + warehouseId)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'warehouse_inventory_by_size',
    filter: 'warehouse_id=eq.' + warehouseId,
  }, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products(warehouseId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
    // optional: queryKeys.posProducts(warehouseId)
  })
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'sales',
    filter: 'warehouse_id=eq.' + warehouseId,
  }, () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sales(warehouseId, {}) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(warehouseId, today) });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  })
  .subscribe();
// cleanup: return () => { supabase.removeChannel(channel); };
```

- For **dashboard** invalidation you can use `queryKeys.dashboard(warehouseId, '')` or the current date; using the same `today` as in the app is preferable if available (e.g. from a small helper or passing date into the hook).
- Add a third `.on('postgres_changes', ...)` for `warehouse_products` with or without filter as per schema (see 3.2).

### 3.4 Replace polling with Realtime in InventoryContext

- **Remove** the `useRealtimeSync` call that passes `onSync: () => loadProducts(..., { silent: true, bypassCache: true })` and `intervalMs: INVENTORY_POLL_MS`.
- **Add** `useInventoryRealtime(currentWarehouseId)` (or `effectiveWarehouseId`) so the active warehouse is subscribed.
- **Keep** the existing `visibilitychange` effect that calls `loadProducts(..., { silent: true, bypassCache: true })` when the tab becomes visible — no code change there. This remains the fallback when Realtime is disconnected or after long sleep.

Optional: If you still want a very slow “safety” poll (e.g. every 5 minutes) only when the tab is visible, you can keep a stripped-down `useRealtimeSync` with a long interval and `disabled` when Realtime is connected; the plan assumes **no** polling once Realtime is in place.

### 3.5 Enable Realtime in Supabase

- In **Supabase Dashboard:** **Database → Replication** (or **Realtime** section depending on project).
- Enable replication for:
  - `warehouse_inventory_by_size`
  - `sales`
  - `warehouse_products`
- No code change; this is a one-time dashboard (or migration) step. Document it in `docs/` so new environments are configured the same.

### 3.6 Query keys and Reports

- **Optional:** Add `queryKeys.reports(warehouseId)` in `src/lib/queryKeys.ts` and use it in `useInventoryRealtime` when invalidating after sales changes. Today the Reports page does not use React Query; the invalidation will matter when/if reports are cached with React Query.
- Use at least `queryClient.invalidateQueries({ queryKey: ['reports'] })` so any future reports query key prefix gets invalidated.

### 3.7 `warehouse_products` and `warehouse_id`

- Confirm in your schema whether `warehouse_products` has a `warehouse_id` column.
- If **yes:** use the same filter pattern as above for `warehouse_products`.
- If **no:** subscribe to `warehouse_products` without a filter and invalidate product (and dashboard) for the **current** warehouse only (the hook already receives `warehouseId`). That way, any product metadata change still triggers a refetch for the active warehouse view.

---

## 4. Testing Checklist

- [ ] **Open POS on Device A (or Tab A).**
- [ ] **Edit a product quantity on Device B (or Tab B).**  
  Device A should update within ~1–2 seconds without manual refresh.
- [ ] **Complete a sale on Device A.**  
  Dashboard on Device B should update within ~1–2 seconds.
- [ ] **Tab visibility fallback:** Disconnect network briefly or close Realtime; after reconnecting or returning to the tab, data should refresh when the user focuses the tab.
- [ ] **Switch warehouse:** Unsubscribe from previous warehouse and subscribe to the new one; no duplicate channels, no leaks.

---

## 5. Files to Add/Change (summary)

| Action | File |
|--------|------|
| Add dependency | `warehouse-pos/package.json` |
| Add | `warehouse-pos/src/lib/supabase.ts` (Supabase client) |
| Add | `warehouse-pos/src/hooks/useInventoryRealtime.ts` (Realtime subscription + invalidation) |
| Edit | `warehouse-pos/src/contexts/InventoryContext.tsx` (remove polling, add `useInventoryRealtime`) |
| Optional edit | `warehouse-pos/src/lib/queryKeys.ts` (add `reports`) |
| Docs / env | Document `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and Replication enablement |

---

## 6. Setup (required for Realtime to work)

**Environment (frontend):** Set in Vercel / `.env.local` for the app that uses this hook:

- `VITE_SUPABASE_URL` — Supabase project URL (e.g. `https://xxxx.supabase.co`).
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key (from Project Settings → API).

If either is missing, `getSupabaseClient()` returns `null` and the hook does not subscribe (no runtime error; Realtime is simply disabled).

**Supabase Dashboard:** Database → Replication (or Realtime) → enable for:

- `warehouse_inventory_by_size`
- `sales`
- `warehouse_products`

---

## 7. Rollback

If Realtime causes issues, revert to polling by:
- Removing `useInventoryRealtime` and restoring `useRealtimeSync` with the previous `onSync` and `intervalMs`.
- Tab visibility refetch remains; no change needed there.

No backend API changes are required for this feature; only frontend and Supabase Replication configuration.
