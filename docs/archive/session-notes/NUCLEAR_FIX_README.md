# THE NUCLEAR BUT CLEAN FIX

**Guaranteed stability:** Server Components only. Direct DB reads. Mutations via Server Actions. Full page refresh on write.

---

## What was built

### `inventory-server/` — Next.js App Router app

- **Server Components only** — `/inventory` page is a Server Component. No client inventory state.
- **Direct DB reads** — `getInventory(warehouseId)` from `lib/data/inventory.ts` runs on the server; reads from Supabase.
- **Mutations via Server Actions** — `addItemAction`, `updateQtyFormAction` in `app/inventory/actions.ts`. No optimistic updates.
- **Full page refresh on write** — Every mutation calls `revalidatePath('/inventory')`; Next.js re-renders the page and re-fetches from DB.

**No:** inventory client state, optimistic updates, cached API routes, SWR, React Query, localStorage merge.

**Yes:** Slightly less “SPA-ish” (full refresh after add/update). Data never lost.

---

## How to run

```bash
cd warehouse-pos/inventory-server
cp .env.local.example .env.local
# Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INVENTORY_TABLE, DEFAULT_WAREHOUSE_ID
npm install
npm run dev
```

Open **http://localhost:3001/inventory**.

---

## What to delete (Vite app) when you switch

When you are done with the old flow and want inventory to be **only** the nuclear path:

1. **Remove inventory client state**  
   - Delete or gut `src/contexts/InventoryContext.tsx` (no `products` state, no `loadProducts`, no merge, no localStorage for inventory).  
   - Or keep a minimal context that only redirects to the Next app for inventory.

2. **Remove optimistic updates**  
   - Already removed in Step 2 (write path): we wait for API before updating UI.  
   - If any other code still does “update UI first, then call API”, remove it.

3. **Remove cached API routes**  
   - Backend: ensure GET inventory is not cached (e.g. `cache: 'no-store'`, or use the Next app and skip the external API for inventory).  
   - Frontend: we already use `cache: 'no-store'` on fetches; when inventory is served by `inventory-server`, there are no client inventory API calls.

4. **Point users to the nuclear app**  
   - In the Vite app: change “Inventory” nav link from `/inventory` (client page) to `http://localhost:3001/inventory` (or your deployed inventory-server URL).  
   - Or retire the Vite inventory page and keep only Dashboard, POS, etc.; inventory lives in `inventory-server` only.

---

## Summary

| Before (Vite SPA)           | After (Nuclear)                    |
|----------------------------|------------------------------------|
| Client state + fetch + merge | Server Component + getInventory()   |
| Optimistic updates         | Server Action → revalidatePath     |
| Cached / stale reads       | force-dynamic, revalidate 0, direct DB |
| Risk of lost data          | Single source of truth in DB       |

Run `inventory-server` for inventory. When ready, delete or bypass the old inventory client state and use the nuclear app as the only inventory UI.
