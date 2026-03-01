# Supabase scripts

Run in Supabase SQL Editor unless noted.

## Model: one warehouse per location

- **Main Store location:** one warehouse only — name **Main Store**, code **MAIN** (DC removed).
- **Main Town:** one store + one warehouse, code **MAINTOWN**.

- **Seed:** `seed_stores_warehouses_dc_maintown.sql` — idempotent; creates Main Store (store + MAIN warehouse) and Main Town (store + MAINTOWN warehouse).
- **Consolidation:** Migration `20250222110000_consolidate_main_store_remove_dc.sql` merges DC inventory into MAIN and removes DC. Run once if you had DC.
- **Orphan cleanup:** Migration `20250222100000_clean_orphans_after_main_town_merge.sql` removes inventory/user_scopes for deleted warehouse IDs.

### Rollback (DC consolidation)

There is no safe rollback for `20250222110000_consolidate_main_store_remove_dc.sql` after it has run: DC rows and inventory are deleted and merged into MAIN. If you must re-create DC for testing, re-insert a warehouse with code `DC` and link it to the Main Store; the app will still exclude DC from the warehouse list (see `getWarehouses` and `WarehouseContext`).

## Scripts

| Script | Purpose |
|--------|--------|
| `seed_stores_warehouses_dc_maintown.sql` | Seed Main Store (store + MAIN warehouse) and Main Town (store + MAINTOWN). Safe to run multiple times. |
| `verify_warehouses_ready_for_data.sql` | Confirm both MAIN and MAINTOWN exist and are ready for data (inventory/sales counts, FK integrity). Run anytime. |
| `verify_user_scopes.sql` | Verify user_scopes: one row per cashier, correct store/warehouse. Run after seed. |
| `backfill_sized_products_missing_size_rows.sql` | Backfill `warehouse_inventory_by_size` for sized products missing size rows. |
| `setup.sql` | Schema/setup (tables, RPC). See project docs. |

## Verification after seed

Run `verify_user_scopes.sql`. Expected:

- `cashier@extremedeptkidz.com` → store **Main Store**, warehouse **Main Store** (code MAIN)
- `maintown_cashier@extremedeptkidz.com` → store **Main Town**, warehouse **Main Town** (code MAINTOWN)
