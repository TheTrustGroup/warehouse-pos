# Next Steps: Delivery + POS (Senior Engineer Checklist)

**Implementation completed.** The following was done:

- **POSPage** now uses `useWarehouse()` only: `currentWarehouse`, `setCurrentWarehouseId`, `warehouses`. No `WAREHOUSES` or `warehouse`/`setWarehouse`. Fallback warehouse when context not yet loaded.
- **SessionScreen**, **POSHeader**, **CartBar** created under `src/components/pos/` with the props POSPage expects.
- **Deliveries** route added at `/deliveries`; **DeliveriesPageRoute** passes `warehouseId` from `useWarehouse().currentWarehouseId` and `apiBaseUrl`.
- **Sidebar** updated with a "Deliveries" link (Truck icon, same permission as Sales: `PERMISSIONS.REPORTS.VIEW_SALES`).
- **TypeScript**: `CompletedSale` fixed (extends with Omit + optional `deliveryStatus`); POSPage `handleAddToCart` uses `?? null` for `sizeCode`/`sizeLabel`; unused `IconShare` removed from SaleSuccessScreen.
- **Builds**: `warehouse-pos` and `warehouse-pos/inventory-server` both build successfully.

You still need to do the following.

---

## 1. Run the database migration

- Open **Supabase Dashboard → SQL Editor**.
- Run the contents of **`warehouse-pos/supabase/migrations/DELIVERY_MIGRATION.sql`**.
- Confirm the final `SELECT` returns the 8 new columns on `sales`.

---

## 2. Environment and API

- **inventory-server:** Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or fallback) so `app/api/sales/route.ts` can reach Supabase.
- **Frontend:** Set `VITE_API_BASE_URL` to the deployed inventory-server base URL so POS, Sales History, and Deliveries hit the same API.

---

## 3. Optional: Align Sales History warehouse list

- **`SalesHistoryPage`** uses a hardcoded `WAREHOUSES` array. For consistency, you can load the list from `useWarehouse().warehouses` and pass `warehouseId` from `currentWarehouseId`.

---

## Summary

1. Run **DELIVERY_MIGRATION.sql** in Supabase.
2. Set **env** for inventory-server and frontend.
3. (Optional) Wire Sales History to **warehouses** from context.
