# Wiring Audit — Delivery + POS (Senior Engineer)

**Status:** Verified. Builds pass; no regressions to existing flows.

---

## 1. Builds

- **warehouse-pos:** `npm run build` ✅
- **warehouse-pos/inventory-server:** `npm run build` ✅

---

## 2. WarehouseContext (single source of truth)

- **Provider:** Wraps app in `App.tsx` → `ProtectedRoutes` → `WarehouseProvider` → … → `Layout` → `Outlet`.
- **API:** `useWarehouse()` returns `{ warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse, isLoading, … }`. No `WAREHOUSES` or `warehouse`/`setWarehouse`.
- **Consumers:**
  - **Sidebar:** Uses `warehouses`, `currentWarehouseId`, `setCurrentWarehouseId`, `currentWarehouse` — unchanged.
  - **InventoryPage:** Uses `currentWarehouseId`, `currentWarehouse`, `warehouses`, `setCurrentWarehouseId` — unchanged; no code changes.
  - **POSPage:** Uses `currentWarehouse`, `setCurrentWarehouseId`, `warehouses`; derives `contextWarehouse = currentWarehouse ?? FALLBACK_WAREHOUSE`; syncs local `warehouse` from context in `useEffect`.
  - **DeliveriesPageRoute (App.tsx):** Uses `useWarehouse().currentWarehouseId` and passes it to `DeliveriesPage`; only rendered under `Layout` → inside `WarehouseProvider` ✅

---

## 3. POS flow

- **SessionScreen:** Receives `warehouses` from context, `activeWarehouseId={warehouse.id}`, `onSelect={handleWarehouseSelect}`. `handleWarehouseSelect(w)` calls `setCurrentWarehouseId(w.id)`, `setWarehouseLocal(w)`, `setSessionOpen(false)`.
- **POSHeader / CartBar:** Receive props from POSPage; no context used.
- **CartSheet:** Receives `warehouseId={warehouse.id}`, `onCharge={handleCharge}`. `handleCharge` POSTs to `/api/sales` with delivery fields; backend expects them (optional, default `delivered`).
- **Products:** `loadProducts(warehouse.id)` runs when `!sessionOpen`; uses same `warehouse.id` for API and for POST `/api/sales`.

---

## 4. Sales API (inventory-server)

- **POST /api/sales:** Requires auth (`requireAuth`), accepts delivery fields; defaults `delivery_status` to `'delivered'`; inserts/updates `sales` + `sale_lines`; legacy fallback when `record_sale` RPC missing.
- **GET /api/sales:** Optional `warehouse_id`, `from`/`to`, `pending=true`; returns `{ data, total }` with camelCase and delivery fields; legacy path when DB has no delivery columns.
- **PATCH /api/sales:** Body `saleId`, `deliveryStatus`, optional `deliveredBy`, optional `warehouseId`; updates `delivery_status`, sets `delivered_at`/`delivered_by` when status `delivered`.

---

## 5. Frontend → API

- **POSPage:** Uses `API_BASE_URL` and `getApiHeaders()` from `lib/api`; POST and GET use same base.
- **SalesHistoryPage:** Uses `apiBaseUrl ?? API_BASE_URL` and `getApiHeaders()`; GET `/api/sales?warehouse_id=…&from=…&limit=500`.
- **DeliveriesPage:** Uses `apiBaseUrl ?? API_BASE_URL` and `getApiHeaders()`; GET `/api/sales?warehouse_id=…&pending=true`; PATCH `/api/sales` with JSON body. `credentials: 'include'` set.

---

## 6. Routes and permissions

- **/pos:** `ProtectedRoute permission={PERMISSIONS.POS.ACCESS}` — unchanged.
- **/sales:** `ProtectedRoute anyPermissions={[PERMISSIONS.REPORTS.VIEW_SALES]}` — unchanged.
- **/deliveries:** `ProtectedRoute anyPermissions={[PERMISSIONS.REPORTS.VIEW_SALES]}`; `DeliveriesPageRoute` passes `warehouseId` and `apiBaseUrl`.
- **Sidebar:** “Deliveries” link added with `PERMISSIONS.REPORTS.VIEW_SALES`; filter uses same `hasPermission`/`anyPermissions` logic.

---

## 7. Backward compatibility

- **DB:** Migration adds delivery columns with defaults; existing rows get `delivery_status = 'delivered'`. No breaking schema change.
- **GET /api/sales:** If DB has no delivery columns, route catches error and uses `getSalesLegacy()` (no delivery fields in response). Frontend (SalesHistoryPage, DeliveriesPage) tolerates missing optional fields.
- **InventoryPage / Dashboard / Orders:** No changes; still use `useWarehouse()` as before.

---

## 8. Edge cases covered

- **POS:** When `currentWarehouse` is null (e.g. before warehouses fetch), `contextWarehouse = FALLBACK_WAREHOUSE`; `warehouse` state syncs from context when `contextWarehouse?.id` or `contextWarehouse?.name` changes.
- **Deliveries:** When `currentWarehouseId` is `''`, GET request still fires with `warehouse_id=`; backend does not filter by warehouse (returns all); page still renders.
- **Sales API:** All delivery fields optional on POST; PATCH validates `deliveryStatus` enum.

---

## Conclusion

Wiring is consistent; delivery and POS changes do not break the previous build or existing behaviour. Remaining steps: run `DELIVERY_MIGRATION.sql` (you confirmed columns exist) and set env vars for server and frontend.
