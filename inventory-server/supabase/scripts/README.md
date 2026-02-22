# Supabase

## What to run in SQL (order)

Run these in **Supabase Dashboard → SQL Editor** (or via `supabase db push` for migrations):

1. **`scripts/setup.sql`** — First. Creates/updates `warehouse_inventory_by_size`, `size_codes`, syncs inventory, and creates the `update_warehouse_product_atomic` RPC. Idempotent; safe to run more than once.  
   **Prerequisite:** Tables `warehouses`, `warehouse_products`, and `warehouse_inventory` must already exist (e.g. from an earlier migration that creates warehouses and warehouse-scoped inventory).

2. **Migrations** (in timestamp order):
   - `migrations/20250222040000_create_durability_log.sql` — audit log table.
   - `migrations/20250222040001_create_v_products_inventory_view.sql` — view used by the API for product list/detail.

3. **Optional:** `scripts/backfill_sized_products_missing_size_rows.sql` — Run once if you have sized products missing per-size rows.

4. **Stores / warehouses / user_scopes:** If you use the app’s warehouse switcher and user scopes, ensure the schema has `stores`, `user_scopes`, and `warehouses.store_id`. Run **`scripts/phase3_stores_and_user_scopes_schema.sql`**, then **`scripts/seed_stores_warehouses.sql`** to create and seed `stores` and two warehouses (Main Store, Main Town). Optionally add rows to `user_scopes` to restrict which user can see which warehouse. If you see duplicate “Main Town” in the warehouse dropdown, run **`scripts/merge_duplicate_main_town.sql`** (merge MAIN_TOWN into MAINTOWN, then remove duplicate) or **`scripts/cleanup_single_main_town.sql`** (full cleanup: one store + one MAINTOWN warehouse).

**Check:** At the end of `setup.sql` there is a small verification query (PART 6); run it to confirm tables and RPC are present.

---

**Canonical schema (global products):**
- `warehouse_products(id, sku, name, ...)` — no `warehouse_id`. One row per product.
- `warehouse_inventory(warehouse_id, product_id, quantity)` — links warehouse to product.
- `warehouse_inventory_by_size(warehouse_id, product_id, size_code, quantity)` — per-size qty.
- `warehouse_id` exists only on inventory tables; never on `warehouse_products`.

## Migrations (versioned, run in order)

| Migration | Purpose |
|-----------|---------|
| `20250222040000_create_durability_log.sql` | durability_log table + indexes |
| `20250222040001_create_v_products_inventory_view.sql` | v_products_inventory view |

Apply with `supabase db push` or run files in timestamp order in SQL Editor. Prerequisite: `warehouse_products`, `warehouse_inventory`, `warehouse_inventory_by_size`, `size_codes` (e.g. from `scripts/setup.sql`).

## Scripts (one-off / bootstrap / diagnostic)

| Script | Purpose | Idempotent |
|--------|---------|------------|
| `setup.sql` | Full bootstrap: tables, size_codes, PART 3/4 sync, RPC | Yes |
| `phase3_stores_and_user_scopes_schema.sql` | Creates stores, user_scopes, warehouses.store_id (for switcher and scope) | Yes |
| `seed_stores_warehouses.sql` | Inserts Main Store + Main Town (stores and warehouses); run after phase3 schema | Yes |
| `create_v_products_inventory_view.sql` | Same view as migration; use if not using migrations | Yes |
| `create_durability_log.sql` | Same table as migration; use if not using migrations | Yes |
| `backfill_sized_products_missing_size_rows.sql` | One-off backfill for sized products | Run once per env |
| `cleanup_single_main_town.sql` | One Main Town store + one MAINTOWN warehouse; merges inventory and refs | Yes (idempotent) |
| `merge_duplicate_main_town.sql` | Merge MAIN_TOWN (00000002) into MAINTOWN (312ee60a-...), then remove duplicate | Yes (idempotent) |
| `diagnose_warehouse_inventory.sql` | Row counts and total qty per warehouse | Read-only |
| `inventory_diagnostic_fixed.sql` | Diagnostic queries | Read-only |

Run `setup.sql` first in new environments; then apply migrations or run the create_* scripts.

**Production:** Prefer the versioned files in `../migrations/` and a single migration runner. Use these scripts only for one-off backfills or diagnostics; do not rely on ad-hoc script execution for schema.
