# NEXT 3 — Presence: Active Cashiers Dashboard

Admins see which cashiers (and other users) are currently logged in and active. Uses Supabase Realtime Presence; when a user logs out they disappear from the list immediately.

## What was implemented

1. **PresenceContext** (`src/contexts/PresenceContext.tsx`)
   - When the user is authenticated, joins channel `warehouse-pos-presence` with presence key = user email.
   - Tracks: `email`, `displayName` (email), `role`, `warehouseId`, `warehouseName`, `page` (POS / Dashboard / Inventory / …), `lastActivity` (ISO string).
   - Updates `lastActivity` on a throttle (every 30s) and when page or warehouse changes.
   - On logout (or when not authenticated), untracks and unsubscribes so the user disappears from others’ lists.
   - Exposes `presenceList` (others only, sorted by activity, with `isIdle` and `lastActivityAgo`). Idle = no activity for 30 minutes.

2. **PresenceProvider**
   - Wrapped in App inside `WarehouseProvider` so it has access to auth and warehouse. Requires `currentUserEmail`, `currentUserRole`, `currentWarehouseId`, `currentWarehouseName`, `isAuthenticated`.

3. **Dashboard block (admin only)**
   - In `DashboardPage.tsx`: section “Active cashiers” visible when `hasRole(['admin', 'super_admin'])`.
   - Shows “N cashiers active” (or “No other users active”) and a list: display name, page, warehouse, “Active X min ago” or “Idle”.

4. **Dashboard route**
   - `src/pages/Dashboard.tsx` re-exports `DashboardPage` as `Dashboard` so the existing App route that imports `./pages/Dashboard` and uses `m.Dashboard` works.

## Behaviour

- Every logged-in user (cashier or admin) is tracked on the same channel; admins see everyone except themselves.
- If a cashier is inactive for 30 minutes, they are shown as “Idle”.
- When a cashier logs out, they untrack and leave the channel, so they disappear from the admin list right away.
- No backend or database changes; presence is ephemeral and lives only in Realtime.

## Optional

- To show display names instead of email, you’d need a profile or user table and pass `displayName` from there into the presence payload (e.g. from AuthContext or an API).
