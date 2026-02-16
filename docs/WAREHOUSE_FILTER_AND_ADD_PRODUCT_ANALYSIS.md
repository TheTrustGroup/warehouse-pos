# Warehouse filter in Filters panel + Add-product warehouse assignment

## 1. Your idea: move warehouse filter from header into the Filters component

### Summary
**Feasible:** Yes. **Recommendation:** Do it if you want “view by warehouse” to live with other Inventory filters; keep one place to choose warehouse on POS (in-page).

### Current behavior
- **Header:** Warehouse dropdown is global (Inventory, POS, Dashboard, Orders). Same selection drives “which warehouse’s quantities I see” on Inventory and “which warehouse I’m selling from” on POS.
- **Inventory page:** You also have a warehouse dropdown in the summary line (“X products found · Warehouse: [dropdown]”).
- **Filters panel:** Category, Min/Max quantity, Low stock only, Out of stock only. No warehouse.

### If we move warehouse into the Filters component

**Option A – Add to Filters, keep in header**
- Add a “Warehouse” dropdown at the top of the Filters panel (Inventory only).
- Keep the header warehouse dropdown so POS/Dashboard/Orders still have a global selector.
- **Pro:** Warehouse feels like “filter by location” on Inventory; header still shows current warehouse everywhere.  
- **Con:** Two places to change warehouse on Inventory (header and Filters); need to keep them in sync (they already use the same context, so they stay in sync).

**Option B – Add to Filters, remove from header**
- Add “Warehouse” to the Filters panel on the Inventory page.
- Remove the warehouse block from the header entirely.
- POS already has its own warehouse selector in the POS content; Dashboard/Orders can show current warehouse as read-only or get a small in-page selector if needed.
- **Pro:** Header is simpler (search, logout, notifications only). “Where am I viewing / selling from?” is chosen per page (Inventory = Filters, POS = POS selector).  
- **Con:** Slightly bigger change; any page that only showed warehouse in the header needs an in-page selector or label.

### Recommendation
- **Option A** is the smallest change: add Warehouse to the Filters panel and leave the header as is. Users who prefer the Filters panel can use it; the header still works for quick switch and for other pages.
- **Option B** is good if you want a cleaner header and are fine with POS (and others) owning their own warehouse control.

### Implementation sketch (Option A or B)
- In `InventoryFilters`, use `useWarehouse()` and render a Warehouse dropdown; onChange call `setCurrentWarehouseId(id)`.
- “Clear all” filters: decide whether clearing filters also resets warehouse or leaves it (usually leave warehouse as-is when clearing category/qty filters).
- If Option B: in `Header.tsx`, hide or remove the store/warehouse block; ensure POS (and any other page that needs it) still has a warehouse selector in its content.

---

## 2. Does selecting a warehouse in the Add product form assign the product to that warehouse?

### Short answer
**Yes, after the fix below.** The backend is designed to assign the new product’s initial stock to the warehouse you send in the request. The frontend was not sending that warehouse in the POST body; that’s now fixed.

### How it works (backend)
- `POST /api/products` (or `/admin/api/products`) receives a body that can include `warehouseId`.
- Backend: `createWarehouseProduct(body)` uses  
  `wid = body.warehouseId ?? getDefaultWarehouseId()`  
  and then creates:
  - one row in `warehouse_products` (the product master), and  
  - one row in `warehouse_inventory` for `(wid, product_id)` with the initial quantity.
- So if the request includes `warehouseId: "<Main town id>"`, the product’s initial stock is recorded **only** for Main town. If `warehouseId` is missing, it falls back to the default (e.g. Main Store).

### What was wrong (frontend)
- The Add product form sets `warehouseId` on the product data (e.g. Main town).
- The context’s `productToPayload()` built the API payload from the product but **did not include `warehouseId`** in that payload.
- So the backend always received no `warehouseId` and used the default warehouse (Main Store). The warehouse chosen in the form was ignored.

### Fix applied
- When calling the API for create, the payload is now extended with  
  `if (productData.warehouseId?.trim()) payload.warehouseId = productData.warehouseId.trim();`  
- So the warehouse you select in the Add product form is sent to the API and the product is assigned to that warehouse as intended.

### Summary
- **Before fix:** Form selection was ignored; new products were assigned to the default warehouse (e.g. Main Store).  
- **After fix:** Form selection is sent; new products are assigned to the warehouse you chose (e.g. Main town).
