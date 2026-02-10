# Inventory & database durability

## Is the database communicating with the backend and storing inventory so it never gets missing or lost?

**Short answer:** Yes. All inventory and product writes go through the backend to Supabase. The backend is the only writer; the frontend never writes directly to the database. Data can only be lost if the backend or Supabase fails mid-write, or if the frontend saves “locally only” when the API is down (see below).

---

## How it works

| Data | Stored in | Written by | Durability |
|------|-----------|------------|------------|
| **Products** (master) | `warehouse_products` | Backend POST/PUT/DELETE | Persisted in Supabase. Create is all-or-nothing: if setting initial quantity fails, the product row is deleted and the error is thrown. |
| **Quantities** (per warehouse) | `warehouse_inventory` | Backend (on product create/update and on POS sale) | Persisted. POS deductions use an atomic RPC (`process_sale_deductions` / `process_sale`) so stock never goes negative and is never lost mid-sale. |
| **Sales** | `transactions` + `transaction_items` | Backend `process_sale` RPC | One atomic transaction: transaction + items + inventory deduction + stock_movements. Either all persist or none. |
| **Audit trail** | `stock_movements` | Backend (inside `process_sale`) | Written in the same transaction as the sale. |

---

## What is atomic (all-or-nothing)

- **POS sale:** One RPC (`process_sale`) inserts the transaction, items, deducts inventory, and writes stock_movements in a single DB transaction. If anything fails, nothing is committed.
- **POS deduct only:** `process_sale_deductions` deducts all lines in one transaction; insufficient stock aborts the whole batch.
- **Product create:** If inserting the product succeeds but setting initial quantity in `warehouse_inventory` fails, the backend deletes the new product row and rethrows, so you never get a product with no inventory row.

---

## What is not atomic (but safe in practice)

- **Product update:** Product metadata and quantity are updated in two steps. If the quantity update fails, the product row is already updated; quantity for that warehouse may stay at the old value until the next successful update. Failures here are rare (same Supabase connection).

---

## Frontend: when can data be “missing” or “lost”?

- **Normal flow:** The UI only shows “Saved” after the backend responds successfully and a read-after-write check sees the new/updated product. So from the user’s perspective, if they see “Saved”, the data is in the database.
- **When the API is down:** If the backend is unreachable, the frontend may save to **localStorage/IndexedDB** and show “Saved locally. It will sync when connection is available.” That data is not in the database until:
  - The user triggers “Sync local inventory to API”, or
  - They add/update again when the API is back.
- So: **data is not lost** if you treat “saved locally” as temporary and sync or retry once the backend is reachable.

---

## Checklist for “inventory never gets missing or lost”

- Backend has **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** set so it can reach the database.
- Migrations have been run so `warehouse_products`, `warehouse_inventory`, `warehouses`, `transactions`, `transaction_items`, and `stock_movements` exist with the expected schema.
- POS sales and inventory deductions go through the backend and use the atomic RPCs; the frontend does not write to the DB.
- Product create is all-or-nothing (product + initial quantity); product update is two-step but failures are rare.
- If the app shows “saved locally”, ensure sync or a later successful request so that data reaches the backend and is stored in the database.
