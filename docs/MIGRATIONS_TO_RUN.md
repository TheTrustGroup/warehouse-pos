# Migrations to Run (Supabase)

Run these in **order** in the Supabase project used by **warehouse-pos-api-v2** (the one in `SUPABASE_URL`). Use **Supabase Dashboard → SQL Editor**: open each file, copy its contents, paste into a new query, and run.

**Order matters:** later migrations depend on tables/columns from earlier ones.

---

## 1. `20250204000000_create_warehouse_products.sql`

- **What:** Creates `warehouse_products` (products table: sku, name, prices, quantity, etc.).
- **Run first.** Everything else builds on this.

---

## 2. `20250209000000_warehouses_and_scoped_inventory.sql`

- **What:** Creates `warehouses`, `warehouse_inventory` (quantity per warehouse per product), inserts default warehouse "Main Store" (id `00000000-0000-0000-0000-000000000001`), backfills quantity from `warehouse_products` into `warehouse_inventory`, then drops `quantity` from `warehouse_products`.
- **Requires:** `warehouse_products` table (migration 1).

---

## 3. `20250209100000_atomic_deduct_inventory.sql`

- **What:** RPCs for atomic inventory deduction (used by POS and order flows).

---

## 4. `20250209200000_transactions_and_stock_movements.sql`

- **What:** Tables and support for transactions and stock movements.

---

## 5. `20250209300000_order_return_inventory.sql`

- **What:** RPCs for order return stock (add back inventory).

---

## 6. `20250209400000_phase2_transactions_observability.sql`

- **What:** Observability/audit support for transactions.

---

## 7. `20250209500000_phase3_stores_and_scope.sql`

- **What:** Creates `stores`, adds `store_id` to `warehouses`, creates `user_scopes` (which store/warehouse each user can access).

---

## 8. `20250209600000_phase4_offline_idempotency.sql`

- **What:** Idempotency support for offline sync (avoid duplicate applies).

---

## 9. `20250211000000_size_codes_and_inventory_by_size.sql`

- **What:** Size codes and inventory-by-size (e.g. S/M/L per product).

---

## 10. `20250211010000_seed_size_codes_kids_infant.sql`

- **What:** Seeds default size codes (e.g. kids/infant). Safe to run multiple times.

---

## 11. `20250211020000_allow_custom_size_codes.sql`

- **What:** Allows custom size codes.

---

## 12. `20250213000000_atomic_product_inventory_rpc.sql`

- **What:** Atomic product + inventory RPCs (create/update product and stock in one transaction).

---

## 13. `20250213100000_indexes_products_category.sql`

- **What:** Indexes on `warehouse_products` for category filtering and ordering.

---

## File paths (in this repo)

All under **`inventory-server/supabase/migrations/`**:

```
20250204000000_create_warehouse_products.sql
20250209000000_warehouses_and_scoped_inventory.sql
20250209100000_atomic_deduct_inventory.sql
20250209200000_transactions_and_stock_movements.sql
20250209300000_order_return_inventory.sql
20250209400000_phase2_transactions_observability.sql
20250209500000_phase3_stores_and_scope.sql
20250209600000_phase4_offline_idempotency.sql
20250211000000_size_codes_and_inventory_by_size.sql
20250211010000_seed_size_codes_kids_infant.sql
20250211020000_allow_custom_size_codes.sql
20250213000000_atomic_product_inventory_rpc.sql
20250213100000_indexes_products_category.sql
```

---

## After migrations: optional seed

To create Main Store, DC, Main town and POS user scopes:

- Run **`inventory-server/supabase/scripts/seed_stores_warehouses_dc_maintown.sql`** in the SQL Editor. Safe to run more than once.

---

## If you’ve already run some

If your project already has `warehouse_products` and `warehouses` (e.g. from an older guide), run **from the first migration you haven’t applied**. Skip any that would re-create existing objects (many use `create table if not exists` or `add column if not exists`); if one fails with “already exists”, that’s usually fine—move on to the next.
