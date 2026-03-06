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

## If something fails

- **503/504 on first load only:** Possible race; ensure dashboard/products/sales are only called when `isValidWarehouseId(warehouseId)` (already in code).
- **Placeholder still in URL:** Hard refresh, clear site data, or confirm the latest commit is deployed.
- **Charge button stuck on “Loading…”:** Warehouse list or auth may not be returning a valid warehouse; check `/api/warehouses` and `/api/auth/user` (and `user_scopes` in DB for that user).

The diagnostic queries in `DATABASE_DIAGNOSTIC_QUERIES.sql` (including the placeholder and `user_scopes` checks) can be run on both EDK and Hunnid Supabase projects as needed.
