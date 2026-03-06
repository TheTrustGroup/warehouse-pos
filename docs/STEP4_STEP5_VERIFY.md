# Step 4 & 5 — Verify warehouse fix (EDK + Hunnid)

After deploying the warehouse placeholder fix, run these checks on **both** deployments.

---

## Step 4 — EDK (warehouse.extremedeptkidz.com)

### 4.1 Console and network (first load)

1. Open **warehouse.extremedeptkidz.com** in an incognito/private window (or clear site data).
2. Log in as a cashier or admin.
3. Go to **POS**.
4. Open DevTools → **Console**.
   - [ ] No **503** or **504** errors.
   - [ ] No request URLs containing `warehouse_id=00000000-0000-0000-0000-000000000001` (placeholder).
5. Open DevTools → **Network**. Filter by **Fetch/XHR**.
   - [ ] Any `/api/dashboard` or `/api/products` request uses a **real** warehouse UUID in the query string (e.g. `312ee60a-9bcb-4a5f-b6ae-59393f716867` for Main Town), not the placeholder.

### 4.2 POS UI

6. In the POS top bar / header, confirm the **location/warehouse name** (e.g. “Main Store” or “Main Town”) is correct.
7. If you see **“Loading warehouse…”** briefly, that’s expected; it should then switch to the real warehouse name.

### 4.3 Complete a sale (first load)

8. Add at least one item to the cart.
9. Open cart and tap **Charge** (button must **not** say “Loading…”).
10. Complete the sale (choose payment method and confirm).
   - [ ] Sale completes with **HTTP 200** (check Network tab for `POST /api/sales`).
   - [ ] In the **request payload** for `POST /api/sales`, `warehouseId` is the **real** UUID, not `00000000-0000-0000-0000-000000000001`.
   - [ ] Stock for the item **decreases and stays decreased** (no rollback).
   - [ ] Sale appears in **Sales** (or Sales History) with correct warehouse and total.

### 4.4 Reload and repeat (no race on first load)

11. **Reload the POS page** (F5 or refresh).
12. Without changing warehouse, add an item and complete another sale.
    - [ ] Sale again completes with 200 and real `warehouse_id`.
    - [ ] If it only worked after refresh but not on first load, there may still be a race; report that.

### 4.5 Database check (Supabase — EDK project)

Run in **Supabase SQL Editor** (EDK project):

```sql
-- Recent sales: warehouse_id must be real UUIDs, not placeholder
SELECT id, warehouse_id, total, created_at
FROM sales
ORDER BY created_at DESC
LIMIT 5;
```

- [ ] Every `warehouse_id` is a real UUID (e.g. `312ee60a-...` or your Main Store UUID). **None** should be `00000000-0000-0000-0000-000000000001` for sales made after the fix (unless that row is a real warehouse in your DB).

---

## Step 5 — Hunnid Official (warehouse.hunnidofficial.com)

The fix is in **shared code**; once this repo is deployed for Hunnid, the same behavior applies.

1. Deploy the same **warehouse-pos** build/code to **warehouse.hunnidofficial.com** (if not already).
2. Open **warehouse.hunnidofficial.com** → log in → go to **POS**.
3. Open DevTools → **Console**.
   - [ ] No 503/504 errors.
   - [ ] No requests with `warehouse_id=00000000-0000-0000-0000-000000000001` in the URL.
4. In **Network** tab, confirm `/api/dashboard` and `/api/products` (and `POST /api/sales` if you run a sale) use a **real** warehouse ID, not the placeholder.
5. Optionally run one sale and confirm 200 + correct `warehouse_id` in payload and in DB (same `sales` query as in 4.5, in Hunnid’s Supabase project).

---

## CORS (API allows your frontend)

The **inventory-server** API uses `inventory-server/lib/cors.ts`. It already allows:

- **Exact origins:** `https://warehouse.extremedeptkidz.com`, `https://warehouse.hunnidofficial.com`, `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4173`
- **Suffixes (any host ending with):** `vercel.app`, `extremedeptkidz.com`, `hunnidofficial.com`

So requests from `https://warehouse.extremedeptkidz.com` to the API (e.g. `https://warehouse-pos-Bag8.vercel.app`) get `Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com` when the request **reaches** the app. If you still see **Status: "-"** or "access control checks", the request is usually **blocked before** it hits Next.js (e.g. **Vercel Deployment Protection** on the API project). Turn that off for the API deployment; no CORS code change is needed.

---

## If something fails

- **503/504 on first load only:** Possible race; ensure dashboard/products/sales are only called when `isValidWarehouseId(warehouseId)` (already in code).
- **Placeholder still in URL:** Hard refresh, clear site data, or confirm the latest commit is deployed.
- **Charge button stuck on “Loading…”:** Warehouse list or auth may not be returning a valid warehouse; check `/api/warehouses` and `/api/auth/user` (and `user_scopes` in DB for that user).

- **"Fetch API cannot load … due to access control checks" / stock not deducting:** Browser is blocking the request (CORS or 403). In Network tab check the failing request status. If **403**, the API host (e.g. Vercel) may be blocking cross-origin—disable Deployment Protection for API or allow your frontend origin. API must have `SESSION_SECRET`/`JWT_SECRET` and Supabase env so auth succeeds.
- **"Failed to load resource: the server responded with a status of 403 ()"** appearing a little while after refresh: In **Network** tab, find the request that returned 403. If the URL is **ingest…sentry.io**, it’s Sentry (error reporting); fix or remove `VITE_SENTRY_DSN`, or disable Sentry in project settings—this does not affect app behaviour. If the URL is your **API** (e.g. `/api/products`, `/api/warehouses`), the app now shows a toast "Access denied (403)…"; fix auth/permissions or Deployment Protection on the API host.
- **GET /api/products shows Status: “-” (no response) / edit product then “Syncing…” but list doesn’t update:** Usually the request is **blocked** (CORS or Vercel Deployment Protection) before the server responds. Check that the request URL uses a **real** warehouse UUID from `/api/warehouses`, not `00000000-0000-0000-0000-000000000001` before the warehouse list has loaded. The app now avoids sending that placeholder until a warehouse is actually selected from the API. Also ensure the **API** Vercel project (e.g. `warehouse-pos-Bag8.vercel.app`) has Deployment Protection **off** and CORS allows your frontend origin (e.g. `https://warehouse.extremedeptkidz.com`).
- **Inventory update takes a while / don’t reflect:** After saving a product, the list refetches from the server immediately (post-save refetch). If updates still don’t show, check for 403/CORS or status “-” on `/api/products`; a 403 during that refetch now shows a toast so you can fix login or API access.

The diagnostic queries in `DATABASE_DIAGNOSTIC_QUERIES.sql` (including the placeholder and `user_scopes` checks) can be run on both EDK and Hunnid Supabase projects as needed.
