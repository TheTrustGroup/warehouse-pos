# Cross-Device Sync (Realtime + Polling)

If inventory updates **don’t appear on another device or browser** after saving, check the following.

## 1. Add tables to Realtime publication (Supabase)

Realtime only broadcasts changes for tables that are in the `supabase_realtime` publication.

**Run in Supabase SQL Editor:** see `docs/REALTIME_ADD_TABLES.sql`.

- First run the `SELECT` to see which tables are already in the publication.
- Then run the `ALTER PUBLICATION ... ADD TABLE` lines for any **missing** tables:
  - `warehouse_inventory_by_size` (required for size qty updates)
  - `warehouse_products`
  - `warehouse_inventory`
  - `sales`

If a table is already in the publication, you’ll get an error for that line; you can ignore it and run the rest.

## 2. Frontend env vars (build-time)

The app needs Supabase URL and anon key so the Realtime client can connect:

- `VITE_SUPABASE_URL` = your project’s Supabase URL (e.g. `https://xxxx.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` = your project’s anon (public) key

Set these in:

- **Local:** `.env` or `.env.local` in `warehouse-pos/`
- **Vercel/host:** Project → Settings → Environment Variables

Then **rebuild and redeploy**. Vite bakes these in at build time, so changing env and refreshing the page is not enough; you must rebuild.

If these are missing, the browser console will show:  
`[Realtime] Not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY...`  
and cross-device updates will only happen via the **30s polling fallback**.

## 3. Polling fallback (30s)

When Realtime is not connected or the table isn’t in the publication, the app still refetches product list every **30 seconds** when the tab is visible. So:

- On the **other** device/browser, leave the Inventory (or POS) tab open and visible.
- Within about **30 seconds**, the list should refresh and show the update.

If you need faster sync without Realtime, you can temporarily lower `intervalMs` in `InventoryContext.tsx` (e.g. to `15_000`).

## 4. Quick checklist

| Check | Action |
|-------|--------|
| Tables in publication | Run `REALTIME_ADD_TABLES.sql` in Supabase; add any missing tables. |
| Env vars set | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in env; then **rebuild + redeploy**. |
| Other device | Same build/deploy (same env); tab visible so 30s poll can run. |
| Console | No `[Realtime] Not configured` warning if Realtime should be used. |

After 1 and 2 are done, saving an inventory update on one device should appear on the other within a few seconds (Realtime) or within 30s (polling).
