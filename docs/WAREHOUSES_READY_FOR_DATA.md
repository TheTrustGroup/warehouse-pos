# Warehouse readiness: Main Store & Main Town

**Verdict: Both warehouses are safe to receive data and can hold any volume the schema allows.**

---

## 1. Schema (database)

| Table | Warehouse scope | Limit per warehouse |
|-------|-----------------|---------------------|
| `warehouses` | One row per location (MAIN, MAINTOWN). | N/A. |
| `warehouse_inventory` | `(warehouse_id, product_id)` — quantity per warehouse per product. | No row limit; FK `warehouse_id REFERENCES warehouses(id)`. |
| `warehouse_inventory_by_size` | `(warehouse_id, product_id, size_code)` — per-size qty per warehouse. | Same as above. |
| `sales` | `warehouse_id NOT NULL REFERENCES warehouses(id)`. | No row limit. |
| `sale_lines` | Via `sale_id` → `sales.warehouse_id`. | No row limit. |

There is no CHECK or application logic that restricts data to a single warehouse. Any UUID that exists in `warehouses.id` is valid for inventory and sales.

---

## 2. Application (API + frontend)

- **Products:** One global catalog (`warehouse_products`); quantity is resolved per warehouse from `warehouse_inventory` and `warehouse_inventory_by_size`. List/GET/POST/PUT all accept `warehouse_id` and read/write inventory for that warehouse.
- **Sales:** `record_sale(warehouse_id, ...)` and GET `/api/sales?warehouse_id=...` are warehouse-scoped. No hardcoding to Main Store only.
- **Warehouse list:** GET `/api/warehouses` returns all non-excluded warehouses (DC is excluded). Main Store (MAIN) and Main Town (MAINTOWN) are both returned if present in the DB.

So both warehouses are treated the same in code; there is no special case that blocks Main Town.

---

## 3. What you must have in the DB

- **Main Store:** Created by migration `20250209000000_warehouses_and_scoped_inventory.sql` with fixed id `00000000-0000-0000-0000-000000000001` and code `MAIN`. If that migration has run, Main Store exists.
- **Main Town:** Not created by that migration. You must run the seed so it exists:
  - **Script:** `inventory-server/supabase/scripts/seed_stores_warehouses_dc_maintown.sql`
  - Run in Supabase SQL Editor (idempotent). It ensures a store "Main Town" and a warehouse with code `MAINTOWN`. Without this, Main Town will not appear in the warehouse dropdown and cannot receive data.

---

## 4. Verification (run in Supabase SQL Editor)

Run:

`inventory-server/supabase/scripts/verify_warehouses_ready_for_data.sql`

- **Section 1:** Should return two rows (MAIN and MAINTOWN). If only one row, run the seed script above.
- **Section 2:** Shows inventory and sales row counts per warehouse. Both can be 0; that only means no data yet.
- **Section 3:** Orphan check. Expect `orphan_count = 0` for both checks. If not, you have invalid `warehouse_id` values to fix.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| Is Main Store safe for real data? | Yes. Created by migration; used in production. |
| Is Main Town safe for real data? | Yes, once the seed has been run so the MAINTOWN warehouse exists. Same schema and code path as Main Store. |
| Any per-warehouse data cap? | No. Same tables and indexes for both; no row limits per warehouse. |
| What to do before using Main Town? | Run `seed_stores_warehouses_dc_maintown.sql` in Supabase if you have not already. Then run `verify_warehouses_ready_for_data.sql` to confirm both warehouses appear and have no orphan rows. |
