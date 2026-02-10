# Changes for Approval: First-Class Warehouse & Warehouse-Scoped Inventory

This document lists **all changes** made to implement the recommendation from the POS data model audit: warehouse as a first-class entity and inventory (and POS/orders) scoped to warehouse.

---

## 1. Audit Addendum (no behavioral change)

- **File:** `AUDIT_PHASE1_DATA_MODEL.md`
- **Change:** Added **Section 8** documenting the “Warehouse” field in the Add Product form:
  - **Required or optional?** Optional (no `required`, no * on label).
  - **Stored as:** String (`location.warehouse` in JSONB).
  - **Server-side validation?** No.
  - **What it controls today:** Nothing that affects inventory or business logic → **MISLEADING UI** verdict.

---

## 2. Database migration (run once before new backend)

- **Migration file in repo:** `inventory-server/supabase/migrations/20250209000000_warehouses_and_scoped_inventory.sql`
- **How to run in Supabase:** See **`SUPABASE_RUN_WAREHOUSE_MIGRATION.md`** in this folder — it has step-by-step Supabase SQL Editor instructions and a full copy of the SQL to paste.
- **Actions (what the migration does):**
  1. Creates table **`warehouses`** (id, name, code unique, created_at, updated_at).
  2. Creates table **`warehouse_inventory`** (warehouse_id, product_id, quantity, updated_at) with PK (warehouse_id, product_id) and FKs to warehouses and warehouse_products.
  3. Inserts default warehouse **Main Store** (code `MAIN`).
  4. Backfills **warehouse_inventory** from current `warehouse_products.quantity` for the default warehouse.
  5. **Drops** column **`quantity`** from **`warehouse_products`** (quantity now only in `warehouse_inventory`).

**Deployment:** Run this migration (e.g. Supabase SQL editor or `supabase db push`) **before** deploying the updated backend. The new backend expects these tables and the product table without `quantity`.

---

## 3. Backend (inventory-server)

### 3.1 New files

| File | Purpose |
|------|--------|
| `lib/data/warehouses.ts` | CRUD for warehouses: `getWarehouses()`, `getWarehouseById(id)`, `getDefaultWarehouseId()` (constant for Main Store id). |
| `lib/data/warehouseInventory.ts` | Warehouse-scoped quantity: `getQuantity(warehouseId, productId)`, `getQuantitiesForWarehouse(warehouseId)`, `setQuantity(...)`, `ensureQuantity(...)`. |
| `app/api/warehouses/route.ts` | GET /api/warehouses → list warehouses. |
| `app/api/warehouses/[id]/route.ts` | GET /api/warehouses/[id] → one warehouse. |

### 3.2 Modified files

| File | Change |
|------|--------|
| `lib/data/warehouseProducts.ts` | **Product row:** no longer has `quantity` (table column removed). **Reads:** `getWarehouseProducts(warehouseId?)`, `getWarehouseProductById(id, warehouseId?)` merge quantity from `warehouse_inventory` for given (or default) warehouse. **Writes:** `createWarehouseProduct` accepts `warehouseId` in body and writes initial quantity to `warehouse_inventory`; `updateWarehouseProduct` updates `warehouse_inventory` when body has `quantity` (and optional `warehouseId`). |
| `app/api/products/route.ts` | GET: reads `warehouse_id` from query and passes to `getWarehouseProducts(warehouseId)`. |
| `app/admin/api/products/route.ts` | Same as above for admin products list. |
| `app/api/products/[id]/route.ts` | GET: reads `warehouse_id` from query and passes to `getWarehouseProductById(id, warehouseId)`. |
| `app/admin/api/products/[id]/route.ts` | Same for admin product by id. |

---

## 4. Front-end

### 4.1 New files

| File | Purpose |
|------|--------|
| `src/contexts/WarehouseContext.tsx` | Fetches warehouses from GET /api/warehouses; holds `currentWarehouseId` (persisted in localStorage); exposes `warehouses`, `currentWarehouseId`, `setCurrentWarehouseId`, `currentWarehouse`, `refreshWarehouses`. Uses `DEFAULT_WAREHOUSE_ID` when API returns no warehouses (e.g. before migration). |

### 4.2 New types

| File | Change |
|------|--------|
| `src/types/index.ts` | Added **Warehouse** (id, name, code, createdAt, updatedAt). Added **warehouseId?** to **Transaction**. |

### 4.3 Modified files

| File | Change |
|------|--------|
| `src/App.tsx` | Wraps app with **WarehouseProvider** (inside AuthProvider, around InventoryProvider). |
| `src/contexts/InventoryContext.tsx` | Uses **useWarehouse()**; all product API calls use **warehouse_id** query (productsPath()); **addProduct** and **updateProduct** send **warehouseId** in body; products reload when **currentWarehouseId** changes. |
| `src/contexts/POSContext.tsx` | Uses **useWarehouse()**; **processTransaction** sets **transaction.warehouseId** and passes **warehouseId** in **updateProduct** when deducting stock. |
| `src/contexts/OrderContext.tsx` | Uses **useWarehouse()**; **deductStock** and **returnStock** pass **warehouseId** in **updateProduct** body. |
| `src/components/inventory/ProductFormModal.tsx` | **Warehouse** field: replaced free-text input with **required** **select** populated from **warehouses** (useWarehouse); form state includes **warehouseId**; submit payload includes **warehouseId**. |
| `src/components/layout/Header.tsx` | Added **warehouse selector** (dropdown) when warehouses list is loaded; current warehouse can be switched; inventory and POS use selected warehouse. |

---

## 5. Behavior summary

- **Inventory:** Quantity is **per warehouse**. Product list and product detail use `?warehouse_id=` (or default) so displayed quantity is for the selected warehouse. Add/Edit product requires a warehouse; quantity is stored in `warehouse_inventory` for that warehouse.
- **POS:** Sales deduct from the **current warehouse** (header selector). Transaction payload includes **warehouseId** for reporting and external systems.
- **Orders:** Reserve/deduct/return use the **current warehouse** when calling **updateProduct** with **warehouseId**.

---

## 6. Rollback / compatibility

- **If migration is not run:** Backend will fail on product list/create/update (no `warehouse_inventory` / `quantity` missing on `warehouse_products`). So **migration must be run before deploying this backend**.
- **If you need to rollback:** Restore `quantity` on `warehouse_products` from a backup or by re-adding the column and repopulating from `warehouse_inventory` for the default warehouse; then deploy the previous backend and front-end.

---

## 7. Approval checklist

- [ ] Run migration `20250209000000_warehouses_and_scoped_inventory.sql` on the target database.
- [ ] Deploy updated **inventory-server** (backend).
- [ ] Deploy updated **front-end** (Vite app).
- [ ] Verify: GET /api/warehouses returns at least Main Store.
- [ ] Verify: Add Product form shows Warehouse dropdown (required); saving creates/updates quantity in selected warehouse.
- [ ] Verify: Switching warehouse in header changes product quantities and POS deduction warehouse.
- [ ] (Optional) Add more warehouses via SQL or a future admin UI and confirm per-warehouse quantities.

---

*End of changes summary. All edits are for first-class warehouse and warehouse-scoped inventory; no truncation or destructive data changes beyond the migration (backfill preserves existing quantity into default warehouse before dropping the column).*
