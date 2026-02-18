# Sizes root-cause investigation — structural level

## What this codebase actually has

- **No single `sizes` column.** Sizes are represented by:
  - **`warehouse_products.size_kind`**: `na` | `one_size` | `sized`
  - **`warehouse_inventory_by_size`**: one row per `(warehouse_id, product_id, size_code)` with `quantity`
- **Single product table**: `warehouse_products` (no `products` / `inventory_products` split).
- **No views** used for the product list: list reads from `warehouse_products` and joins `warehouse_inventory_by_size` in app code.
- **No RLS** on these tables in migrations.
- **No triggers** on `warehouse_products` or `warehouse_inventory_by_size` in migrations.

So the “sizes never show” failure is not due to a missing `sizes` column, two tables, a view, or RLS/triggers. It’s about **`size_kind`** and **`warehouse_inventory_by_size`** being correct and read with the **same `warehouse_id`** used on write.

---

## Verification done (code + SQL script)

| Check | Result |
|-------|--------|
| **PHASE 1 — DB state** | Run `ROOT_CAUSE_SIZES_STRUCTURAL.sql`: recent rows show `size_kind` and `by_size` (from `warehouse_inventory_by_size`). If `size_kind` is always `na` or `by_size` always empty → insert/update or warehouse mismatch. |
| **PHASE 2 — View** | No `.from('products_view')` etc.; list uses `warehouse_products` + app-side by_size fetch. |
| **PHASE 3 — Multiple tables** | Only `warehouse_products`; insert and list use the same table. |
| **PHASE 4 — Triggers** | No triggers on product/by_size in migrations. |
| **PHASE 5 — Update overwriting sizes** | Update builds row with `bodyToRow({ ...existing, ...body })`, so `sizeKind` comes from existing when body doesn’t send it. RPC uses `COALESCE(..., size_kind)` so existing `size_kind` is preserved. No `.update({ sizes: null })`. |
| **PHASE 6 — Test insert** | Optional block in `ROOT_CAUSE_SIZES_STRUCTURAL.sql`: insert a product with `size_kind = 'sized'` and rows in `warehouse_inventory_by_size`, then SELECT to confirm. Proves schema and permissions. |

---

## Most likely causes when sizes still never show

1. **Warehouse mismatch**  
   - List uses `warehouse_id` from query (e.g. `?warehouse_id=...`).  
   - Create/update use `body.warehouseId` or default.  
   - If list is scoped to warehouse A but create/update wrote to default warehouse B, `getQuantitiesBySizeForProducts(warehouseId, sizedIds)` returns empty for A.  
   - **Fix:** Ensure the client sends the **same** `warehouseId` in the create/update request body as the `warehouse_id` used for the product list (and that the list and default warehouse align when no param is sent).

2. **RPCs not deployed**  
   - If `create_warehouse_product_atomic` / `update_warehouse_product_atomic` don’t exist, the code falls back to legacy path. Legacy path is correct but depends on both product insert/update and `setQuantitiesBySize(warehouseId, ...)` using the same `warehouseId`.  
   - **Fix:** Run migration `20250213000000_atomic_product_inventory_rpc.sql` and confirm with `check_size_migrations_applied.sql`.

3. **`size_kind` not set to `sized`**  
   - For multi-size products, `size_kind` must be `sized` so list code treats them as sized and calls `getQuantitiesBySizeForProducts`.  
   - Create: RPC sets `size_kind = 'sized'` when `p_quantity_by_size` has length > 0; legacy path sets it when `hasSized && quantityBySizeRaw?.length`.  
   - **Fix:** Ensure create/update payloads include `quantityBySize` with at least one entry when the product has multiple sizes.

---

## Validation after any fix

1. Add a product with sizes (e.g. S, M, L) and confirm `warehouse_id` in the request matches the list’s warehouse.
2. In Supabase: `SELECT id, name, size_kind, (SELECT jsonb_agg(...) FROM warehouse_inventory_by_size WHERE ...) FROM warehouse_products WHERE name = '...'` → `size_kind = 'sized'` and by_size rows present.
3. Reload list → sizes appear in the UI.
4. Edit product (e.g. change name or stock only) → sizes still show (no overwrite).
5. POS list with same warehouse → sizes available.

---

## Files

- **`ROOT_CAUSE_SIZES_STRUCTURAL.sql`** — Run in Supabase SQL Editor for PHASE 1–4 and optional PHASE 6.
- **`check_size_migrations_applied.sql`** — Confirms tables, `size_kind`, and RPCs exist.

No unrelated refactors; fixes are warehouse consistency, migrations, and payload (size_kind/quantityBySize).
