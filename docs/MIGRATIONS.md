# Migrations overview (inventory-server Supabase)

**Purpose:** Single place for migration order and one-line descriptions. Use when standing up a new Supabase project or verifying schema state.

**Repo:** All migrations live in `inventory-server/supabase/migrations/`. Run **only** timestamped `*.sql` files in chronological order (oldest first). Skip non-timestamped files (e.g. `Fix 405 deployment`).

---

## Prerequisite

- A Supabase project with database created.
- **How to run:** Supabase Dashboard → SQL Editor (paste and run each file in order), or `supabase db push` from `inventory-server/` if the project is linked via Supabase CLI.

---

## Base schema (what the first migrations create)

There is no separate “base” bundle. The **earliest** migrations create core tables and references:

- `warehouse_products`, then `warehouses`, `warehouse_inventory`, `warehouse_inventory_by_size`, `size_codes`, `user_scopes`, `sales`, `sale_lines`, durability log, views, RPCs (`record_sale`, atomic product/inventory, get_products_with_sizes), and seeds.

For a **new environment**, run every migration in the table below in order. For an **existing** project that already has schema from an older runbook, apply only the migrations whose timestamps are **after** your last applied migration.

---

## Migration list (chronological order)

| Migration | Description |
|-----------|-------------|
| `20250204000000_create_warehouse_products.sql` | Warehouse products: single source of truth for warehouse UI. |
| `20250209000000_warehouses_and_scoped_inventory.sql` | Warehouses table and warehouse-scoped inventory. |
| `20250209100000_atomic_deduct_inventory.sql` | Atomic inventory deduction. |
| `20250209200000_transactions_and_stock_movements.sql` | Transactions and stock movements. |
| `20250209300000_order_return_inventory.sql` | Order/return inventory logic. |
| `20250209400000_phase2_transactions_observability.sql` | Phase 2 transactions observability. |
| `20250209500000_phase3_stores_and_scope.sql` | Phase 3 stores and scope. |
| `20250209600000_phase4_offline_idempotency.sql` | Phase 4 offline idempotency. |
| `20250211000000_size_codes_and_inventory_by_size.sql` | Size codes table and per-size inventory. |
| `20250211010000_seed_size_codes_kids_infant.sql` | Seed size codes (kids/infant). |
| `20250211020000_allow_custom_size_codes.sql` | Allow custom size codes. |
| `20250213000000_atomic_product_inventory_rpc.sql` | Atomic product + inventory writes (create/update RPCs). |
| `20250213100000_indexes_products_category.sql` | Indexes for products/category. |
| `20250218100000_get_products_with_sizes_rpc.sql` | RPC: get products with sizes for warehouse. |
| `20250219000000_fix_update_atomic_empty_by_size_quantity.sql` | Fix atomic update when by_size quantity is empty. |
| `20250219100000_enforce_size_kind_consistency_trigger.sql` | Trigger: enforce size kind consistency. |
| `20250219200000_seed_size_codes_eu23_eu37.sql` | Seed size codes EU23–EU37. |
| `20250219210000_seed_size_codes_eu20_eu22.sql` | Seed size codes EU20–EU22. |
| `20250219300000_warehouse_inventory_indexes_and_unique.sql` | Composite indexes for warehouse_inventory. |
| `20250220100000_snapshot_inventory_by_size.sql` | Snapshot per-size inventory (CTE-based). |
| `20250222040000_create_durability_log.sql` | Durability/audit log table. |
| `20250222040001_create_v_products_inventory_view.sql` | View: v_products_inventory. |
| `20250222100000_clean_orphans_after_main_town_merge.sql` | Clean orphaned refs after warehouse merge. |
| `20250222110000_consolidate_main_store_remove_dc.sql` | Consolidate Main Store; remove DC. |
| `20250222120000_sales_and_record_sale.sql` | Sales tables and record_sale RPC. |
| `20250222130000_master_sql_v2.sql` | Master v2: sales status, sale_lines, record_sale v2, storage, RLS. |
| `20250222140000_drop_record_sale_v1_overload.sql` | Drop record_sale v1 overload. |
| `20250222150000_record_sale_single_overload.sql` | record_sale single overload (uuid). |
| `20250222160000_product_images_5mb_limit.sql` | Product-images bucket 5MB limit. |
| `20260301000000_seed_size_codes_big_brand_full_catalog.sql` | Seed big-brand full size catalog. |
| `20260301100000_record_sale_insufficient_stock.sql` | record_sale: enforce sufficient stock (409 on insufficient). |
| `20260301110000_performance_indexes.sql` | Performance indexes for hot paths. |
| `20260301120000_receipt_seq.sql` | Receipt sequence (RCP-YYYYMMDD-NNNN). |
| `20260301130000_sold_by_email.sql` | sold_by_email on sales; record_sale with p_sold_by_email. |
| `20260302110000_harden_security_definer_executes.sql` | Harden SECURITY DEFINER functions. |
| `20260302120000_statement_timeout_30s.sql` | Statement timeout 30s (product list). |
| `20260302153000_products_list_perf_indexes.sql` | Indexes for /api/products list. |
| `20260302160000_role_statement_timeout_10s.sql` | Role statement timeout 10s. |
| `20260302170000_sales_orders_indexes_idle_timeout.sql` | Sales/orders indexes; idle timeout for zombies. |
| `20260303100000_size_codes_size_order.sql` | size_order for size selector (GET /api/size-codes). |
| `20260303120000_user_scopes_user_email_index.sql` | Index on user_scopes(user_email) for getScopeForUser. |

---

## See also

- **Run / connect:** `docs/CONNECT.md`
- **Architecture and roadmap:** `docs/ARCHITECTURE_AND_ROADMAP.md`
- **Commit and migration discipline:** `docs/ENGINEERING_RULES.md`
