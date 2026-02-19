# CRITICAL BUG FIX: Size quantities reset after product update

## Schema context

Per-size inventory lives in a **separate table**:

- **Table:** `public.warehouse_inventory_by_size`
- **Columns:** `warehouse_id` (uuid), `product_id` (uuid), `size_code` (text), `quantity` (int), `updated_at` (timestamptz)
- **Primary key:** `(warehouse_id, product_id, size_code)` — composite, not just `product_id`.

Total stock is in `warehouse_inventory` (one row per warehouse + product); the UI total is derived by **summing** `quantity` across `warehouse_inventory_by_size` for that product/warehouse (and the RPC keeps both in sync).

---

## Root cause (identified)

**A) DELETE + INSERT with empty re-insert**

The update flow uses the RPC `update_warehouse_product_atomic`, which:

1. Updates `warehouse_products`.
2. When `p_quantity_by_size` is not null: **DELETE** all rows in `warehouse_inventory_by_size` for that `(p_warehouse_id, p_product_id)`.
3. If `jsonb_array_length(p_quantity_by_size) > 0`, **INSERT** one row per size from the JSONB array; otherwise (empty array) insert nothing.

So when the backend passed **`p_quantity_by_size = []`** (empty array), the RPC deleted all size rows and inserted none → **sizes were wiped**.

When did we pass an empty array?

- **hasSized** is true when `body.sizeKind === 'sized'` **or** `body.quantityBySize` has length > 0.
- **quantityBySizeRaw** comes only from the request body.
- If the client sent `sizeKind: 'sized'` but **no** (or empty) `quantityBySize` — e.g. partial update (name only) or a bug that dropped size fields — we had:
  - `hasSized === true`
  - `normalized = []`
  - We then set `pQuantityBySize = normalized` (i.e. `[]`) and called the RPC → DELETE all, insert nothing → **size quantities reset**.

So the bug was: **sized product + empty/missing `quantityBySize` in payload → backend sent `[]` to RPC → all per-size rows deleted.**

---

## Fix (surgical)

**File:** `inventory-server/lib/data/warehouseProducts.ts` (function `updateWarehouseProduct`).

When `hasSized` is true but the normalized size list from the payload is **empty**:

- **Before:** We set `pQuantityBySize = normalized` (i.e. `[]`) → RPC wipes all sizes.
- **After:** We **preserve** existing per-size inventory: build `pQuantityBySize` from **existing** product’s `quantityBySize` (from `getWarehouseProductById`), normalized to `{ sizeCode, quantity }[]` and filtered (no NA/One size). Only if existing also has no sizes do we pass `[]`.

So:

- **Explicit clear** (user sets all sizes to 0): we still pass `[]` when `normalized.length > 0 && sum === 0` (unchanged).
- **Partial update or missing size data** (sized product but payload has no size rows): we no longer pass `[]`; we pass the existing sizes so the RPC re-writes the same rows and **size quantities do not reset**.

---

## Verification

1. **RPC still writes `warehouse_inventory_by_size`**  
   Confirmed: `update_warehouse_product_atomic` (in `20250219000000_fix_update_atomic_empty_by_size_quantity.sql`) deletes by `(warehouse_id, product_id)` then inserts from `p_quantity_by_size`. No upsert; delete + insert is correct for “replace all sizes for this product/warehouse”.

2. **Composite key**  
   Table PK is `(warehouse_id, product_id, size_code)`. Delete uses `warehouse_id` and `product_id`; insert uses all three. No collapse into one row.

3. **Dev log**  
   In non-production, before calling the RPC we log:  
   `[updateWarehouseProduct] Saving sizes: <array or null>` and `sizeCount`.  
   If you see `[]` or `sizeCount: 0` when you expect sizes, the payload is empty (fix frontend or rely on preservation). If you see a non-empty array, the backend is sending sizes correctly.

4. **Stock count**  
   Total stock is still derived from the RPC: it sums per-size quantities and writes `warehouse_inventory.quantity`. The list/POS use that total and the per-size breakdown from `warehouse_inventory_by_size` (via `get_product_with_sizes` / `get_products_with_sizes`).

---

## Other points checked

- **B) Save only updates product table**  
  No. The RPC updates `warehouse_products` and then, when `p_quantity_by_size` is not null, updates `warehouse_inventory_by_size` and `warehouse_inventory`.

- **C) Empty sizes from form (stale closure / unregistered fields)**  
  The form sends `quantityBySize` when `sizeKind === 'sized'`. If a future change sends a partial payload without sizes, the backend now preserves existing sizes instead of wiping.

- **D) Wrong upsert key**  
  We do not use upsert for by_size; we use delete-then-insert scoped by `(warehouse_id, product_id)`. No key collision.

- **Delete-then-insert**  
  We keep delete-then-insert by design (full replace for that product/warehouse). The fix was to stop sending an empty array when the payload had no size rows; we now preserve existing in that case.
