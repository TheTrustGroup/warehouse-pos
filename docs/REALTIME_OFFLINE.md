# Why the "Offline" (red) indicator stays on

The header shows **Live** (green), **Syncing…** (yellow), or **Offline** (red) for **Supabase Realtime** (cross-device inventory/sales updates). If it stays red, check the following.

## 1. Supabase env vars not set at build time

The frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **when the app is built**. Vite inlines them; they are not read at runtime.

- **Local:** Add to `.env.local` in the repo root (same folder as `package.json`):
  ```
  VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
  VITE_SUPABASE_ANON_KEY=your_anon_key
  ```
  Then run `npm run build` (or `npm run dev`).

- **Vercel:** In the project → Settings → Environment Variables, add:
  - `VITE_SUPABASE_URL` = your Supabase project URL  
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon (public) key  

  Redeploy so the new build has these values. If you use **build:vercel** (frontend + server in one deploy), the same env vars must be set for that project.

If these are missing, the Realtime client is never created and the indicator stays **Offline**. You should see one console warning: `[Realtime] Not configured: set VITE_SUPABASE_URL...`.

## 2. Realtime publication (tables in publication)

Realtime must include the tables the app subscribes to. Run the migration that adds them to the `supabase_realtime` publication:

- `inventory-server/supabase/migrations/20260305260000_realtime_publication_tables.sql`

It adds: `warehouse_inventory_by_size`, `sales`, `warehouse_products`, `warehouse_inventory`. If this migration has not been applied, the subscription may never reach SUBSCRIBED or may error.

## 3. RLS blocking anon (subscription runs as anon)

The frontend uses `createClient(url, anonKey)` with no user JWT, so the Realtime connection is **anon**. RLS on the subscribed tables must allow **anon** to SELECT, or the subscription will fail (e.g. CHANNEL_ERROR) and the indicator will stay red or show error.

Apply the migration that adds anon SELECT for the Realtime tables:

- `inventory-server/supabase/migrations/20260305340000_realtime_anon_select.sql`

After applying, redeploy is not required; the next page load will reconnect.

## 4. No warehouse selected

Realtime subscribes per warehouse. If no warehouse is selected yet (e.g. before CriticalData load finishes), the hook sets status to **disconnected**. Once a valid warehouse is set, it will try to connect. If the indicator stays red even after the app has loaded and a warehouse is selected, the cause is one of 1–3 above.

## Checklist

| Check | Action |
|-------|--------|
| Env vars at build | Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel (and redeploy) or in `.env.local` locally. |
| Publication | Run migration `20260305260000_realtime_publication_tables.sql` in Supabase if not already applied. |
| RLS for anon | Run migration `20260305340000_realtime_anon_select.sql` in Supabase. |
| Warehouse | Ensure a warehouse is selected (e.g. Main Store); Realtime runs only when `warehouseId` is valid. |

After fixing 1–3, reload the app; the indicator should move to **Syncing…** then **Live** (green) when the subscription is established.
