# Deploy and Stock Alerts Verification

Ensure the backend is deployed, the warehouse matches, and the DB has updated stock so **Stock Alerts** on the Dashboard reflect reality.

---

## 1. Backend is deployed

The Dashboard’s Stock Alerts come from **GET /api/dashboard** (inventory-server). The server must be the one that includes the “always fresh lowStockItems” logic.

- **Build (local check):** From repo root:
  ```bash
  cd inventory-server && npm run build
  ```
  Must complete without errors.

- **Deploy:** Deploy `inventory-server` to your host (e.g. Vercel):
  - Point the project (or subpath) at `inventory-server` (or the monorepo root if your build uses `build:vercel`).
  - Set env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `UPSTASH_REDIS_*` for dashboard cache.
  - After deploy, the live API base URL (e.g. `VITE_API_BASE_URL`) must be that deployment so the app calls the new backend.

- **Verify:** Open the app, go to Dashboard, then Inventory. Edit a product (e.g. add sizes so it has stock). Return to Dashboard and refresh or refocus the tab. That product should **leave** the “Out of stock” list if its quantity is above reorder level.

---

## 2. Warehouse matches

Stock Alerts are **per warehouse**. Dashboard and Inventory both use the **same** warehouse from `WarehouseContext` (`currentWarehouseId` / effective warehouse).

- In the UI, the header or warehouse selector (e.g. “Main Store”) is the active warehouse.
- When you edit a product on **Inventory**, the app sends that same warehouse in the request (`warehouseId` in the payload).
- When you open **Dashboard**, it requests stats for that same warehouse (`warehouse_id` in the API URL).

So: pick the same warehouse (e.g. Main Store) when editing and when viewing the Dashboard. If you edit “Main Town” but the Dashboard is showing “Main Store”, the list will not reflect the edit.

---

## 3. DB actually has updated stock for that warehouse

Product quantity is stored in:

- **Sized products:** `warehouse_inventory_by_size` (rows per product_id, warehouse_id, size_code, quantity).
- **Non-sized:** `warehouse_inventory` (product_id, warehouse_id, quantity).

After saving an edit from the app:

- **App check:** Open **Inventory**, select the same warehouse (e.g. Main Store), find the product. It should show “In stock” and the sizes/quantities you set. If it does, the DB was updated for that warehouse.
- **DB check (Supabase):** For a sized product, query `warehouse_inventory_by_size` for that `product_id` and your warehouse’s `warehouse_id`. You should see rows with the new quantities. For non-sized, check `warehouse_inventory` the same way.

If Inventory shows the new stock but Dashboard still shows the product as “Out of stock”, the backend serving the app may not be the one you just deployed (wrong API URL or cache). Re-check step 1.

---

## Quick checklist

| Step | Action |
|------|--------|
| Backend build | `cd inventory-server && npm run build` ✅ |
| Backend deploy | Deploy inventory-server; set Supabase (and optional Redis) env. |
| API URL | App’s `VITE_API_BASE_URL` points at that deployment. |
| Warehouse | Same warehouse selected when editing (Inventory) and when viewing Dashboard. |
| DB | Inventory page shows the product with new stock for that warehouse. |
| Refresh | After editing, open Dashboard (or refocus tab) so it refetches; alerts list updates. |
