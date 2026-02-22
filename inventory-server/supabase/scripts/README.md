# Supabase

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
| `create_v_products_inventory_view.sql` | Same view as migration; use if not using migrations | Yes |
| `create_durability_log.sql` | Same table as migration; use if not using migrations | Yes |
| `backfill_sized_products_missing_size_rows.sql` | One-off backfill for sized products | Run once per env |
| `inventory_diagnostic_fixed.sql` | Diagnostic queries | Read-only |

Run `setup.sql` first in new environments; then apply migrations or run the create_* scripts.
