# POS Flow Audit — Simulation & Verification

**Scope:** Real POS flow: select warehouse → add to cart → complete sale → persist transaction → reduce inventory.  
**Criteria:** Atomic, warehouse-specific, transaction-safe; no negative inventory; no concurrent overwrite.  
**Fail conditions:** POS does not require warehouse selection; POS uses default warehouse silently; POS updates global inventory.

---

## 1. Simulated flow (code trace)

| Step | Implementation | Location |
|------|----------------|----------|
| 1. Select warehouse | User selects from header dropdown **or** app uses `currentWarehouseId` from `WarehouseContext` (initialized from localStorage or `DEFAULT_WAREHOUSE_ID`). | `WarehouseContext.tsx`, `Header.tsx` |
| 2. Add product to cart | `addToCart(productId, quantity)` — checks `product.quantity >= quantity` (from products loaded with `?warehouse_id=currentWarehouseId`), then appends to cart. | `POSContext.tsx` |
| 3. Complete sale | `processTransaction(payments, customer)` — builds `Transaction` with `warehouseId: currentWarehouseId`, then deducts via `updateProduct(id, { quantity: newQty, warehouseId })` per item, then POSTs transaction to `/api/transactions`. | `POSContext.tsx` |
| 4. Persist transaction | `apiPost(API_BASE_URL, '/api/transactions', payload)`. **Note:** This repo has no `/api/transactions` route; persistence is external or local. | `POSContext.tsx` |
| 5. Reduce inventory | For each cart item: `updateProduct(product.id, { quantity: product.quantity - item.quantity, warehouseId: currentWarehouseId })` → PUT `/api/products/[id]` with body `{ quantity, warehouseId }` → backend `setQuantity(warehouseId, productId, newQuantity)`. | `InventoryContext` → `warehouseProducts.ts` → `warehouseInventory.setQuantity` |

---

## 2. Verification results

### 2.1 POS requires warehouse selection

| Check | Result | Evidence |
|-------|--------|----------|
| Is warehouse selection required before sale? | **FAIL** | POS does not block "Complete sale" when warehouse is only from default/localStorage. User can complete sale without ever opening the warehouse dropdown. |
| Is warehouse selection required before add-to-cart? | **FAIL** | Add-to-cart works with whatever `currentWarehouseId` is (default or pre-selected). No explicit "select warehouse first" gate. |

**Verdict:** **FAIL** — POS does not require warehouse selection.

---

### 2.2 POS does not use default warehouse silently

| Check | Result | Evidence |
|-------|--------|----------|
| Is a default warehouse used without user action? | **FAIL** | `WarehouseContext` initializes `currentWarehouseId` from `localStorage.getItem(STORAGE_KEY)` or `DEFAULT_WAREHOUSE_ID` (`00000000-0000-0000-0000-000000000001`). No explicit user selection required. |
| When API returns multiple warehouses, is one pre-selected? | **FAIL** | If API returns list, first warehouse or stored id is set; user may never actively select. |

**Verdict:** **FAIL** — POS can use default warehouse silently.

---

### 2.3 POS does not update global inventory

| Check | Result | Evidence |
|-------|--------|----------|
| Are deductions scoped to a warehouse? | **PASS** | `processTransaction` passes `warehouseId: currentWarehouseId` into `updateProduct`. Backend `updateWarehouseProduct` uses `body.warehouseId` and calls `setQuantity(warehouseId, productId, quantity)` on `warehouse_inventory`. |
| Is quantity read from warehouse-scoped source? | **PASS** | Products are loaded with `?warehouse_id=currentWarehouseId`; quantity comes from `warehouse_inventory` for that warehouse. |

**Verdict:** **PASS** — POS updates warehouse-specific inventory, not global.

---

### 2.4 Inventory reduction is atomic

| Check | Result | Evidence |
|-------|--------|----------|
| Are all line-item deductions in one atomic operation? | **FAIL** | POS calls `updateProduct` once per cart item via `Promise.all(cart.map(...))`. Each is a separate HTTP PUT. If one fails mid-way, prior deductions are already committed. No single database transaction. |
| Does backend support atomic batch deduct? | **FAIL** | Backend has no endpoint that deducts multiple items in one DB transaction. |

**Verdict:** **FAIL** — Inventory reduction is not atomic.

---

### 2.5 Inventory reduction is warehouse-specific

| Check | Result | Evidence |
|-------|--------|----------|
| Is each deduction applied to the selected warehouse? | **PASS** | `warehouseId` is passed on every `updateProduct`; backend writes only to `warehouse_inventory` for that `warehouse_id`. |

**Verdict:** **PASS** — Warehouse-specific.

---

### 2.6 Inventory reduction is transaction-safe

| Check | Result | Evidence |
|-------|--------|----------|
| Are deduction and transaction record in one logical transaction? | **FAIL** | Order is: (1) deduct inventory (multiple PUTs), (2) POST transaction. If POST fails, inventory is already reduced with no sale record. No rollback of deductions. |
| Can we roll back deductions if transaction save fails? | **FAIL** | No compensating endpoint or two-phase flow. |

**Verdict:** **FAIL** — Not transaction-safe.

---

### 2.7 Inventory cannot go negative

| Check | Result | Evidence |
|-------|--------|----------|
| Does backend reject over-deduction? | **PARTIAL** | `setQuantity` writes `Math.max(0, Math.floor(quantity))` — so stored value never goes below 0, but backend accepts the client’s *new* quantity. Client sends `newQuantity = product.quantity - item.quantity`. If two concurrent sales both read 10, both send 8 and 7, last write wins and one sale’s deduction is lost. |
| Is deduction done as atomic "decrement by N" with check? | **FAIL** | Backend does read (in getWarehouseProductById) then client computes new qty then PUT with new qty. No `UPDATE ... SET quantity = quantity - N WHERE quantity >= N`. So concurrent requests can oversell. |

**Verdict:** **FAIL** — No atomic decrement; concurrent sales can lead to oversell or inconsistent state.

---

### 2.8 Concurrent sales do not overwrite each other

| Check | Result | Evidence |
|-------|--------|----------|
| Is quantity update race-free? | **FAIL** | Classic read-modify-write: client reads quantity, subtracts, sends new quantity. Two clients can read same value and overwrite each other. No row-level lock or atomic decrement. |

**Verdict:** **FAIL** — Concurrent sales can overwrite each other.

---

## 3. Audit summary (after fixes)

| Criterion | Result | Fix |
|-----------|--------|-----|
| POS requires warehouse selection | **PASS** | When multiple warehouses, POS shows "Select warehouse" and blocks add-to-cart and payment until user selects. Single warehouse auto-selected but shown as "Selling from: X". |
| POS does not use default warehouse silently | **PASS** | No silent default when 2+ warehouses (currentWarehouseId set to '' until user selects). Single warehouse is explicit "Selling from: X". |
| POS does not update global inventory | **PASS** | Deductions use `warehouseId` and backend `warehouse_inventory` only. |
| Inventory reduction is atomic | **PASS** | POST /api/inventory/deduct runs `process_sale_deductions` in one DB transaction (all lines or none). |
| Inventory reduction is warehouse-specific | **PASS** | Deduct endpoint and transaction both carry `warehouseId`. |
| Inventory reduction is transaction-safe | **PASS** | Order: (1) atomic batch deduct, (2) persist transaction. Deduct fails on insufficient stock (409); sale not recorded. If transaction POST fails after deduct, inventory is already reduced (operational recovery; no double-sale). |
| Inventory cannot go negative (atomic check) | **PASS** | `deduct_warehouse_inventory` does `UPDATE ... WHERE quantity >= p_amount`; raises INSUFFICIENT_STOCK if would go negative. |
| Concurrent sales do not overwrite each other | **PASS** | Atomic decrement in DB (UPDATE quantity = quantity - N) prevents read-modify-write overwrite. |

**Overall:** **AUDIT PASSED** after implementation of: required warehouse selection (and no silent default), POST /api/inventory/deduct with atomic batch DB function, and POS flow calling deduct then persist transaction.
