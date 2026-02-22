# Warehouse context wiring

## Problem fixed

**"Main Town selected but Main Store stats showing"** — Dashboard was requesting `warehouse_id=...0001` (Main Store) even when the sidebar showed "Main Town". Sidebar, Dashboard, InventoryPage, and POS each had their own warehouse state.

## Solution

`WarehouseContext` is the **single source of truth** for the selected warehouse. Every page reads from it; when the sidebar changes the warehouse, all pages re-fetch. Selection is persisted to `localStorage` so it survives refresh.

## Wiring checklist

1. **App root**  
   Wrap the app with `WarehouseProvider` (already done in `App.tsx` inside `ProtectedRoutes`: `StoreProvider` → `WarehouseProvider` → `InventoryProvider` → …).

2. **Any component that needs the selected warehouse**  
   Use the hook and derive data from it; do not keep local warehouse state.

   ```ts
   import { useWarehouse } from '../contexts/WarehouseContext';

   const { warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse } = useWarehouse();
   ```

3. **Where to use `useWarehouse()`**
   - **Sidebar** – show dropdown, call `setCurrentWarehouseId(id)` on change.
   - **MobileMenu** – same as Sidebar.
   - **Dashboard** – use `currentWarehouse` / `currentWarehouseId` for stats and API calls.
   - **InventoryPage** – use `currentWarehouseId`, `setCurrentWarehouseId`, `warehouses` (or fallback list); do not use local `useState` for warehouse.
   - **POS** – use `currentWarehouseId` (or session-bound warehouse) for cart and checkout.
   - **InventoryContext** – already uses `currentWarehouseId` for product API `warehouse_id`.

4. **Do not**
   - Store warehouse selection in component state when that selection should be global (sidebar selection must match Dashboard/Inventory/POS).
   - Fetch or default to a hardcoded warehouse ID in a page when the user has already chosen one in the sidebar; always read from `useWarehouse()`.

## Quick reference

| Need                    | Use from context                         |
|-------------------------|------------------------------------------|
| Current warehouse id    | `currentWarehouseId`                     |
| Current warehouse object| `currentWarehouse`                       |
| List for dropdown       | `warehouses` (from API; fallback if empty) |
| Change selection        | `setCurrentWarehouseId(id)`              |
