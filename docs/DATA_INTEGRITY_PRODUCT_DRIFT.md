# Data Integrity: Product and Quantity Drift

**Goal:** Quantities and product visibility in the DB must match the UI. Drift (data in DB not showing correctly in the UI) must be fixed and prevented.

---

## 1. What is drift?

- **Quantity drift:** `warehouse_inventory.quantity` ≠ sum of `warehouse_inventory_by_size.quantity` for the same `(warehouse_id, product_id)`.
- **Visibility “drift”:** The app uses “by_size sum when present, else inv.quantity”. If a product has quantity only in `warehouse_inventory` and no rows in `warehouse_inventory_by_size`, some views or reports that only read `warehouse_inventory_by_size` can show 0 or omit the product. The list API includes products that have either inv or by_size, and uses inv when by_size is empty, so the main Inventory/POS list can still show them—but dashboard/reports that use a view keyed only on by_size may not.

---

## 2. Root causes

| Cause | Description |
|-------|--------------|
| **Inv-only writes** | Quantity written to `warehouse_inventory` without a matching row in `warehouse_inventory_by_size` (e.g. one-size product created before by_size backfill, or manual SQL). |
| **By_size-only or stale inv** | Rows in `warehouse_inventory_by_size` updated without updating `warehouse_inventory.quantity`, or inv row missing. |
| **Warehouse/scope mismatch** | User sees a different warehouse than the one the list was fetched for (see `docs/POS_WAREHOUSE_SCOPE_DIAGNOSTIC.md` and `docs/TRACE_PRODUCT_SIZES_VANISH.md`). |

---

## 3. Fix existing drift

Run in **Supabase SQL Editor** in this order:

1. **Detect drift (optional)**  
   Use the “Quantity drift” section (── 4) in `inventory-server/supabase/scripts/VERIFY_TOTAL_STOCK_VALUE.sql` to list rows where `warehouse_inventory.quantity` ≠ sum(by_size).

2. **Inv has qty but no by_size rows**  
   Run: `inventory-server/supabase/scripts/FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql`  
   - Backfills one `warehouse_inventory_by_size` row per (warehouse, product) with size_code `'NA'` or `'OS'`. **Skips `size_kind = 'sized'`** so XS/S/M are not overwritten.  
   - Prerequisite: size codes `'NA'` and `'OS'` exist in `size_codes` (seed in migration).

3. **By_size correct but inv stale or missing**  
   Run: `inventory-server/supabase/scripts/SYNC_INV_FROM_BY_SIZE.sql`  
   - Sets `warehouse_inventory.quantity` = sum(by_size) and inserts inv rows where by_size exists but inv does not.

4. **Re-verify**  
   Run the VERIFY script again; drift section should return no rows (or only intentional exceptions).

---

## 4. Prevention (never happen again)

| Mechanism | Purpose |
|-----------|--------|
| **Trigger `sync_warehouse_inventory_from_by_size`** (migration `20260305240000_sync_warehouse_inventory_from_by_size_trigger.sql`) | On INSERT/UPDATE/DELETE on `warehouse_inventory_by_size`, recompute and set `warehouse_inventory.quantity` = sum(by_size) for that (warehouse_id, product_id). Keeps inv in sync whenever by_size changes. |
| **Trigger `backfill_by_size_from_inv_when_empty`** (migration `20260308100000_backfill_by_size_when_inv_only.sql`) | On INSERT or UPDATE of `warehouse_inventory.quantity`, if quantity > 0 and there are no `warehouse_inventory_by_size` rows, insert one row (NA or OS). **Skips `size_kind = 'sized'`** so XS/S/M etc are never overwritten by OS. |
| **Unique index `idx_warehouse_products_sku_unique`** (migration `20260309100000_sku_unique_and_size_codes.sql`) | One non-empty SKU per product. Prevents duplicate products; API returns "A product with this SKU already exists" on conflict. **Do not drop this index** unless you are fixing duplicates and will recreate it. |
| **Product edit URL** | Frontend uses `PUT /api/products/:id` (id in path) so the update route is hit. Keeps "server unavailable" on edit from happening. |
| **App discipline** | Create/update flows write both `warehouse_inventory` and `warehouse_inventory_by_size` (sized products). RPCs `record_sale`, `complete_delivery`, `void_sale` update both. |

---

## 5. Checklist for data integrity

- [ ] Migrations applied: `20260305240000_sync_warehouse_inventory_from_by_size_trigger.sql`, `20260308100000_backfill_by_size_when_inv_only.sql`, `20260309100000_sku_unique_and_size_codes.sql`.
- [ ] After any one-off or manual inventory load: run `FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql` and/or `SYNC_INV_FROM_BY_SIZE.sql` only if you see missing quantities; then re-run VERIFY.
- [ ] Do not drop `idx_warehouse_products_sku_unique` unless resolving duplicates and recreating it (see `scripts/RECREATE_sku_unique_index.sql`).
- [ ] Dashboard/reports: ensure they use the same quantity rule as the API (by_size sum when present, else inv.quantity); if a view uses only by_size, the triggers above keep both sources in sync so totals match.
- [ ] If products “don’t show” for a warehouse: confirm warehouse scope and list request use the same warehouse (see `POS_WAREHOUSE_SCOPE_DIAGNOSTIC.md`, `TRACE_PRODUCT_SIZES_VANISH.md`).

---

## 6. Script reference

| Script | When to run |
|--------|-------------|
| `VERIFY_TOTAL_STOCK_VALUE.sql` | Audit totals and list quantity drift (section 4). |
| `FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql` | Inv has qty but no by_size rows (products not showing qty in views that use only by_size). |
| `SYNC_INV_FROM_BY_SIZE.sql` | By_size is correct but inv is wrong or missing. |

All under `inventory-server/supabase/scripts/`. Run in Supabase SQL Editor.
