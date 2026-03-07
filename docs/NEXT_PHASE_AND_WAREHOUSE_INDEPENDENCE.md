# Warehouse independence & next phase

## What was fixed (Main Store vs Main Town)

- **Warehouse dropdown** now works for multi-warehouse users (e.g. info@): auth no longer returns `warehouse_id` for them, so the selector is shown and changes apply.
- **Product list and dashboard are independent per warehouse:** On warehouse change we now:
  - Pass **explicit `warehouseId`** into `loadProducts()` so the fetch always uses the selected warehouse (no ref race).
  - Use per-warehouse cache and React Query keys (`['products', warehouseId]`, `['dashboard', warehouseId, date]`), so Main Store and Main Town never share data.

After deploy, do a **hard refresh** and **re-login** as info@ so the frontend gets the updated user payload. Then switch between Main Store and Main Town and confirm:
- Dashboard stats (SKUs, stock value, alerts) change per warehouse.
- Product list and quantities (e.g. sizes) are for the selected warehouse only.

---

## Amiri (or any product) still shows “Out of stock”

The list API returns **all products** (global catalog) with **per-warehouse** quantities from `warehouse_inventory` and `warehouse_inventory_by_size`. If a product shows 0 or “Out of stock” for a warehouse, that’s what’s in the DB for that warehouse.

To fix “Amiri still out of stock” for **Main Store**:

1. **Confirm data in Supabase** (see `docs/AMIRI_DIAGNOSTIC_STEPS.md`):
   - `warehouse_products`: product exists (one row per product).
   - `warehouse_inventory_by_size`: rows for `warehouse_id = '00000000-0000-0000-0000-000000000001'` (Main Store) and the product’s `product_id` with the right `size_code` and `quantity`.
2. If those rows are missing or quantity is 0, add/update them (via app or SQL). The API and UI will then show the correct stock.
3. If the API response in Network tab already shows `quantityBySize` with quantities for Main Store but the UI still shows “Out of stock”, the bug is in the frontend (e.g. wrong product id or display logic); that’s a separate trace.

---

## Suggested next phases

| Phase | Focus | Where to look |
|-------|--------|----------------|
| **Deploy & verify** | Deploy inventory-server (and frontend if needed), hard refresh, re-login, test warehouse switch and Amiri. | `docs/DEPLOY_AND_STOCK_VERIFY.md`, `docs/ENGINEERING_RULES.md` §7 |
| **Data correctness** | Ensure Main Store / Main Town have the right rows in `warehouse_inventory` and `warehouse_inventory_by_size` for products that should show stock. | `docs/AMIRI_DIAGNOSTIC_STEPS.md`, Supabase SQL editor |
| **Testing & CI** | Add or run tests for warehouse-scoped APIs and UI. | `npm run test`, `.github/workflows/ci.yml` |
| **Mobile & cache** | Avoid stale data on mobile (service worker, cache headers). | `docs/ENGINEERING_RULES.md` §8, §9 |
| **Offline / PWA** | If you use offline mode, ensure sync and conflict handling are clear. | `docs/REALTIME_OFFLINE.md`, offline feature flag |

Commit and push from `warehouse-pos/` after changes; see `docs/ENGINEERING_RULES.md` for the full checklist.
