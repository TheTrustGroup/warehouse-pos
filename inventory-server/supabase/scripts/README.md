# Supabase scripts

**Canonical schema (global products):**
- `warehouse_products(id, sku, name, ...)` — no `warehouse_id`. One row per product.
- `warehouse_inventory(warehouse_id, product_id, quantity)` — links warehouse to product.
- `warehouse_inventory_by_size(warehouse_id, product_id, size_code, quantity)` — per-size qty.
- `warehouse_id` exists only on inventory tables; never on `warehouse_products`.

| Script | Purpose | Idempotent |
|--------|---------|------------|
| `setup.sql` | Tables, size_codes migration, PART 3/4 sync, RPC | Yes |
| `create_v_products_inventory_view.sql` | View for list/detail with quantityBySize | Yes (CREATE OR REPLACE) |
| `backfill_sized_products_missing_size_rows.sql` | One-off backfill for sized products | Run once per env |
| `inventory_diagnostic_fixed.sql` | Diagnostic queries | Read-only |
| `create_durability_log.sql` | Table for logDurability() audit entries | Yes |

Run `setup.sql` first in each environment; then `create_v_products_inventory_view.sql` if using the view. Run `create_durability_log.sql` once if using durability logging.
