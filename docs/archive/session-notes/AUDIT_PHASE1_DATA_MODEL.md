# PHASE 1 — POS Data Model Audit (Read-Only)

**System:** warehouse.extremedeptidz.com (Warehouse & POS)  
**Scope:** Real data model used by POS/Inventory; structural readiness for production retail.  
**Rule:** No schemas, migrations, or data were modified. Analysis and trace only.

---

## 1. Product Model

### 1.1 Authoritative source (what POS and Inventory use)

The **live** product data used by the warehouse UI and POS comes from:

- **API:** `GET/POST /api/products`, `GET/PUT/DELETE /api/products/[id]`, `DELETE /api/products/bulk` (and `/admin/api/*` equivalents).
- **Backend in repo:** `inventory-server/lib/data/warehouseProducts.ts` → Supabase table **`warehouse_products`**.

**Schema (from migration and code):**

| Column        | Type      | Notes |
|---------------|-----------|--------|
| id            | uuid (PK) | Default `gen_random_uuid()` |
| sku           | text      | Not null, default '' |
| barcode       | text      | Not null, default '' |
| name          | text      | Not null |
| description   | text      | Default '' |
| category      | text      | Default '' |
| tags          | jsonb     | Default '[]' |
| **quantity**  | integer   | Not null, default 0 — **single stock number per row** |
| cost_price    | decimal(12,2) | Default 0 |
| selling_price | decimal(12,2) | Default 0 |
| reorder_level | integer   | Default 0 |
| **location**  | jsonb     | Default `{"warehouse":"","aisle":"","rack":"","bin":""}` — warehouse is a **string**, not a FK |
| supplier      | jsonb     | `{ name, contact, email }` |
| images        | jsonb     | Default '[]' |
| expiry_date   | timestamptz | Nullable |
| created_by    | text      | Default '' |
| created_at    | timestamptz | Default now() |
| updated_at    | timestamptz | Default now() |
| version       | integer   | Default 0 (optimistic lock) |

**Front-end type:** `src/types/index.ts` — `Product` with `quantity`, `location: { warehouse, aisle, rack, bin }`, etc. One-to-one with a `warehouse_products` row.

### 1.2 Alternate schema in repo (not used by main POS/Inventory)

- **File:** `inventory-server/lib/data/inventory.ts`
- **Tables:** `Product`, `ProductVariant`, `Category` (Supabase). ProductVariant has `stock: number` (again, no warehouse reference).
- **Usage:** Used only by `inventory-server/app/inventory/` (separate “server only” inventory page). The main warehouse UI and POS do **not** call these tables; they use `/api/products` → `warehouse_products` only.

---

## 2. Inventory Model

- **Where inventory lives:** In the **same** table as the product: `warehouse_products.quantity`.
- **Shape:** One integer per product row. No separate `inventory` or `stock_movements` table in the codebase; no `inventory` table in the migration.
- **Writes:** POS and Orders deduct/restore by calling `updateProduct(id, { quantity })` → API `PUT /api/products/[id]` → `updateWarehouseProduct()` which updates `warehouse_products.quantity` (and `updated_at`, etc.).
- **Scoping:** There is **no** `warehouse_id` (or equivalent) on the row. Quantity is **global** — one number for the product across the whole system.

---

## 3. Warehouse Model

- **First-class entity?** **No.** There is no `Warehouse` table and no `warehouse_id` column anywhere in the product or inventory schema.
- **How “warehouse” appears:** Only as a **string** inside the JSONB `location` field: `location.warehouse`. It is a free-text label (e.g. “Main Store”), not a reference to a warehouse entity.
- **Settings:** `SettingsContext` and SystemPreferences use a `defaultWarehouse` string (e.g. “Main Store”); this is UI/defaulting only, not tied to a warehouse entity or scoped inventory.
- **Conclusion:** Warehouse is a **label**, not a first-class entity. The system cannot enforce referential integrity, warehouse-level reporting, or per-warehouse stock.

---

## 4. POS Transaction Model

### 4.1 Front-end / type definition

- **Type:** `src/types/index.ts` — `Transaction`: id, transactionNumber, type ('sale' | 'return' | 'transfer'), items (TransactionItem[]), subtotal, tax, discount, total, paymentMethod, payments[], cashier, customer?, status, syncStatus, createdAt, completedAt.
- **TransactionItem:** productId, productName, sku, quantity, unitPrice, subtotal.
- **No** `warehouseId`, `storeId`, or `locationId` on the transaction. The transaction is not tied to any warehouse or site in the type or in the code that builds it.

### 4.2 Persistence

- **When online:** Client POSTs to `API_BASE_URL + '/api/transactions'` with the transaction payload. **This repo’s `inventory-server` does not define `/api/transactions`** — no route under `inventory-server/app/api/` or `app/admin/` for transactions. So transaction persistence depends on an **external** backend.
- **When offline or API failure:** Transaction is stored in localStorage (`transactions`, `offline_transactions`) and/or IndexedDB (`offline_transactions` queue) and synced later to `/api/transactions`. Again, that endpoint is external.
- **Inventory impact:** `POSContext.processTransaction()` deducts stock by calling `updateProduct(product.id, { quantity: newQuantity })` for each cart item — i.e. it updates the **global** `warehouse_products.quantity`. No warehouse or store is involved in the deduction.

### 4.3 Orders (for completeness)

- **Type:** `src/types/order.ts` — `Order` with items, status, delivery, payment, and `inventory: { reserved, deducted, reservedAt?, deductedAt? }`.
- **API:** Client uses `GET/POST /api/orders`, `PATCH /api/orders/[id]`, etc. **No** `/api/orders` routes in this repo; orders are also expected to be persisted by an external backend.
- **Stock:** OrderContext reserves/deducts/returns stock via the same `updateProduct(id, { quantity })` pattern — again global quantity, no warehouse scope.

---

## 5. Explicit Answers (as requested)

### Is inventory tracked globally or per warehouse?

**Globally.**  
Inventory is the single `quantity` column on `warehouse_products`. There is no warehouse-scoped inventory table and no `warehouse_id` on the product row. All POS and order flows deduct/restore this one quantity. Multi-warehouse or multi-location stock is not supported by the current data model.

### Is warehouse a first-class entity or just a label?

**Just a label.**  
There is no Warehouse table and no warehouse foreign key. “Warehouse” exists only as the string `location.warehouse` in the product’s JSONB `location` field. It is not an entity that can be selected, constrained, or used for scoped queries or reporting.

### Can the same product exist in multiple warehouses?

**No, not in a structured way.**  
The model is one row per product with one global quantity. The same logical product (e.g. same SKU) could only “exist” in multiple warehouses by duplicating rows (different `id`) and manually setting `location.warehouse` to different strings — which would mean duplicate SKUs, no single source of truth for that product, and no consolidated or per-warehouse stock semantics. So the current design does **not** support “same product in multiple warehouses” in a correct, first-class way.

---

## 6. CRITICAL: Inventory is not warehouse-scoped

**Finding:** Inventory is **not** warehouse-scoped. It is a single global quantity per product.

**Implications for production retail:**

1. **Multi-warehouse / multi-store:** Cannot represent stock per location. Any “warehouse” or “store” in the UI is cosmetic (e.g. default label); all sales and orders deduct from the same global number.
2. **Accuracy:** If the business has more than one physical location, global quantity will not reflect per-location reality; over-sales or incorrect replenishment at individual sites are likely.
3. **Reporting and audits:** Cannot report or audit by warehouse or store. No way to reconcile “warehouse A” vs “warehouse B” or to attribute transactions to a location.
4. **Transfers:** Transaction type includes `'transfer'`, but there is no warehouse-scoped stock to transfer between; transfers cannot be modeled correctly without a per-warehouse inventory model.

**Recommendation:** For production use with multiple warehouses or stores, the data model must introduce a first-class Warehouse (or Location) entity and scope inventory to it (e.g. `warehouse_id` on an inventory/stock table, or per-warehouse quantity columns/keyed structure), and scope POS transactions (and optionally orders) to a warehouse/store so that deductions and reporting are location-accurate.

---

## 7. Summary Table

| Area            | Finding |
|-----------------|--------|
| **Product**     | Single table `warehouse_products`; one row per product; API in repo serves this. |
| **Inventory**  | Same table: `quantity`; single integer per product; **global**, not per warehouse. |
| **Warehouse**   | Not an entity; only `location.warehouse` string in JSONB. |
| **POS transaction** | Type has no warehouse/store; persistence via external `/api/transactions`; deductions update global `quantity`. |
| **Orders**      | Persistence via external `/api/orders`; reserve/deduct/return also use global `quantity`. |
| **Same product, multiple warehouses** | Not supported; would require duplicate rows and duplicate SKUs. |
| **CRITICAL**    | **Inventory is not warehouse-scoped** — structural flaw for multi-location retail. |

---

## 8. Addendum: “Warehouse” Field in Add Product / Inventory Intake Form

**Source:** `src/components/inventory/ProductFormModal.tsx` (Location section), backend `inventory-server/lib/data/warehouseProducts.ts`.

### 8.1 Field behavior

| Question | Answer |
|----------|--------|
| **Required or optional?** | **Optional.** No `required` attribute and no asterisk on the label (unlike Product Name *, SKU *, Category *, Quantity *). Default value is `"Main Store"`. |
| **Stored as** | **String.** Value is `formData.location.warehouse`; persisted in `warehouse_products.location` JSONB as `location.warehouse`. Not a foreign key; not an enum. |
| **Server-side validation?** | **No.** Backend `bodyToRow()` uses `loc.warehouse ?? ''` — any string is accepted. No FK check, no enum, no format validation. |

### 8.2 What “warehouse” actually controls today

**Nothing that affects inventory or business logic.**

- **Quantity:** Product quantity is a single global column (`warehouse_products.quantity`). POS and orders deduct from that one number regardless of the Warehouse field value.
- **Filtering / scoping:** Inventory list and POS do not filter by warehouse. There is no “current warehouse” that limits which products or quantities are shown.
- **Display:** The inventory table’s location column uses `getLocationDisplay(location)`, which returns only **aisle–rack–bin**; it does **not** include the warehouse string. So the value is stored but not shown in the main product table.
- **Reporting / transactions:** No report or transaction is keyed by this warehouse value.

So the Warehouse field is **display-only metadata** (physical location label). Users may believe they are assigning stock to a warehouse; in reality, all stock is global and the value does not affect quantities, availability, or reporting.

### 8.3 Verdict: **MISLEADING UI**

The Warehouse field suggests that inventory is organized or scoped by warehouse. It is not. The field does not affect inventory quantities or any downstream behavior. For production use with multiple warehouses or stores, the data model must introduce a first-class Warehouse (or Location) entity and scope inventory to it (e.g. `warehouse_id` on an inventory/stock table, or per-warehouse quantity structure), and scope POS transactions (and optionally orders) to a warehouse/store so that deductions and reporting are location-accurate.

---

*End of Phase 1 — Data Model Audit. No changes were made to schemas, migrations, or data.*
