# Preventing Product / Size / Duplicate Issues

**Use this as a quick reference so the same problems don’t come back.**

---

## 1. Product edit “server unavailable” or “check backend”

**Prevention (already in code):**

- The app uses **PUT `/api/products/:id`** (product id in the URL), so the update route is always hit.
- Do **not** change the update path back to `PUT /api/products` without the id; the handler that does the real update lives at `/api/products/:id`.

**If it happens again:** Check that `InventoryContext` still calls `productUpdatePath('/api/products', id)` so the path includes the id. See `src/contexts/InventoryContext.tsx`.

---

## 2. Sizes (XS, S, M) reverting to OS / One Size

**Prevention (DB + scripts):**

- **Trigger** `backfill_by_size_from_inv_when_empty` (migration `20260308100000`) **skips `size_kind = 'sized'`**. So it never inserts an OS row for sized products; only the app writes XS/S/M.
- **Script** `FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql` also **excludes** `size_kind = 'sized'`, so manual runs don’t overwrite sizes.

**If it happens again:**

- Confirm the trigger and script still have the “skip sized” logic (see `20260308100000_backfill_by_size_when_inv_only.sql` and `scripts/FIX_DRIFT_BACKFILL_BY_SIZE_FROM_INV.sql`).
- Don’t run drift-fix scripts “just in case”; only when you actually see missing quantities (see `docs/DATA_INTEGRITY_PRODUCT_DRIFT.md`).

---

## 3. Duplicate products (same SKU)

**Prevention (DB + API):**

- **Unique index** `idx_warehouse_products_sku_unique` (migration `20260309100000`) enforces one non-empty SKU per product.
- **Do not drop this index** unless you’re fixing duplicates and will recreate it (use `scripts/RECREATE_sku_unique_index.sql`).
- The **create-product API** returns a clear error: *“A product with this SKU already exists. Use a unique SKU or edit the existing product.”*

**If you need to fix duplicates before (re)creating the index:** Run the full migration `20260309100000_sku_unique_and_size_codes.sql`; it deduplicates SKUs (appends product id to duplicates) then creates the index.

---

## 4. Checklist for new deployments or DB changes

- [ ] All three migrations are applied: `20260305240000`, `20260308100000`, `20260309100000`.
- [ ] No one drops `idx_warehouse_products_sku_unique` without a reason and without recreating it.
- [ ] Drift scripts (`FIX_DRIFT_*`, `SYNC_INV_*`) are run only when you’ve confirmed drift (see `docs/DATA_INTEGRITY_PRODUCT_DRIFT.md`).
- [ ] Backend and frontend are deployed together after changes to product create/update or API routes.

---

## 5. Where to look for more detail

| Topic              | Doc / file |
|--------------------|------------|
| Quantity drift, triggers, scripts | `docs/DATA_INTEGRITY_PRODUCT_DRIFT.md` |
| Migrations, commit discipline     | `docs/ENGINEERING_RULES.md`             |
| SKU index recreate                | `inventory-server/supabase/scripts/RECREATE_sku_unique_index.sql` |
