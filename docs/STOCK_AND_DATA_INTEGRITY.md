# Stock accuracy and data integrity — no leaks, accurate recording

This doc explains how the system keeps stock correct and data secure, and what you can do to keep it that way.

---

## 1. How stock is kept accurate (no “leaks”)

### Sales are the only place stock is deducted in one shot

- **POS sales** go through `POST /api/sales` → Supabase RPC **`record_sale`**.
- Inside `record_sale` (in one transaction):
  - A row is inserted into `sales`.
  - For each line, **current stock is checked** (with `FOR UPDATE` so two sales can’t race).
  - If **any** line would go negative, the RPC raises **`INSUFFICIENT_STOCK`** and the **whole sale is rolled back** (no partial deduct).
  - Deductions use **`GREATEST(0, quantity - v_qty)`** so quantity never goes below zero at the DB level.

So:

- Stock cannot go negative from a sale.
- You don’t get “half” a sale (either all lines deduct or none).
- Concurrency is handled in the DB (no double-sell of the same unit from two requests).

### Inventory and product updates

- **Product create/update** (Inventory) writes to `warehouse_inventory` and `warehouse_inventory_by_size` (per warehouse).
- Those updates **set** quantity (e.g. after receiving stock or correcting counts), they don’t deduct like a sale.
- To avoid “leaking” or wrong numbers when editing a product:
  - Prefer **receiving/restock** via a clear flow (e.g. add quantity in the product form or a dedicated “restock” action) rather than ad‑hoc edits.
  - When in doubt, do a **physical count** and then set quantity to the counted value.

### What can still cause wrong-on-screen or “feels like a leak”

- **Optimistic UI:** POS deducts on screen before the API responds. If the API fails (e.g. 422 INSUFFICIENT_STOCK), the UI rolls back. If the user retries and the first request later succeeds (e.g. slow network), you could get double deduct. Mitigation: show “Sale not synced” and avoid retrying the same cart blindly; refresh product list after a failed sale.
- **Manual product edits:** Changing quantity in the product modal **overwrites** DB quantity. If someone sets 10 when real stock is 3, you’ve effectively “added” 7. So: treat manual quantity edits as trusted and restrict who can do them (see permissions).
- **Sync queue / offline:** If the app queues updates and sends them later, ensure each sale is sent **once** (idempotency by `receipt_id` or client id helps). Current API does not dedupe by receipt; adding that would reduce double-send risk.

---

## 2. Recording is accurate

- **Single source of truth:** Quantities live in `warehouse_inventory` and `warehouse_inventory_by_size`. Sales deduct only via `record_sale`.
- **Sales are immutable for stock:** `record_sale` inserts `sales` + `sale_lines` and deducts in one transaction. There is no “adjust sale after the fact” that re-deducts; void/refund flows would need to **add** stock back (separate logic).
- **Warehouse scope:** The API only allows sales (and product/inventory access) for warehouses the user is allowed to see (`getScopeForUser` → `allowedWarehouseIds`). So recording is scoped to the right location.

To keep recording accurate in practice:

- Use **one warehouse per session** (or clear selection) so staff don’t sell from the wrong store.
- Don’t share cashier accounts; use **per-cashier login** so `sold_by_email` and audit trails (if you add them) are meaningful.
- If you add **void/refund**, implement them as explicit flows that **add** stock back and optionally mark the sale as voided, instead of ad‑hoc edits to inventory.

---

## 3. No data leakage (security)

- **RLS (Row Level Security):** Tables like `warehouse_inventory`, `warehouse_products`, `sales`, `sale_lines`, `warehouses`, `user_scopes` have RLS enabled. Only **`service_role`** has policies that allow access; **`anon`** and **`authenticated`** have no direct table access. So the DB does not expose your data to anonymous or normal Supabase auth users; only the backend (using the service role key) can read/write.
- **API auth and scope:**  
  - `POST /api/sales` and product/inventory APIs require auth and enforce **warehouse scope** (user can only see/use warehouses in `allowedWarehouseIds`).  
  - So users don’t see or deduct stock for other warehouses.
- **Secrets:** The app uses **Supabase service role key** only on the server (inventory-server). It must not be in the frontend bundle or in client-visible env (e.g. only in Vercel env for the API). Never commit `.env` or `.env.local` with real keys.

So:

- **Stocks** are not “leaked” to other tenants or the public: access is via your API, with auth and warehouse scope.
- **Data** is not leaked from the DB: RLS + service_role-only access to business tables.

---

## 4. Checklist: keep stock and data safe

| Area | Action |
|------|--------|
| **Stock accuracy** | Rely on POS sales for deductions; avoid ad‑hoc manual quantity edits except for restock/correction. |
| **Reorder level** | Set reorder level on products and use “products at or below reorder level” (Dashboard) to reorder before stock hits zero. |
| **Recording** | One warehouse per POS session; one login per cashier; no sharing of service role or API keys. |
| **Security** | Keep `SUPABASE_SERVICE_ROLE_KEY` only on the server; ensure RLS is applied (migration `20260304110000_rls_all_business_tables.sql`). |
| **Sync / retries** | If a sale fails with INSUFFICIENT_STOCK, refresh product list and fix cart before retrying; avoid “retry all” on the same cart without refresh. |
| **Void/refund** | Implement as explicit flows that add stock back (and optionally mark sale voided); do not just edit inventory. |

---

## 5. Dashboard vs product card (“in stock on card, out of stock on dashboard”)

**Symptom:** A product shows as in stock on the Inventory product card but as “Out of stock” in the Dashboard “Stock Alerts” (products at or below reorder level).

**Causes:**

1. **Stale product list** — Inventory may be showing a cached product list while the Dashboard just fetched fresh data. Both use the same API with the same `warehouse_id`; with fresh data they match.
2. **Different warehouse** — Dashboard and Inventory must use the same warehouse. If the app uses a sentinel warehouse id for one view (e.g. “Main Town” with empty data), the other can show a different warehouse and counts will not match.
3. **Count vs list** — The “X out of stock” count comes from the DB RPC (all products). The Stock Alerts *list* is from the first 250 products (by name). The count can be higher than the list length; for products in that list, cards and Stock Alerts use the same data.

**What to do:** Use the same warehouse on both views and **refresh the Inventory page** (reopen or pull-to-refresh) so the product list is refetched and matches the Dashboard.

---

## 6. Optional improvements (future)

- **Idempotent sales:** Accept an optional `idempotency_key` or `receipt_id` in `POST /api/sales` and skip creating a duplicate sale if that key was already processed. Reduces double-send from sync queue or retries.
- **Stock movement log:** Write to `stock_movements` (or a dedicated audit table) from `record_sale` for every deduct (sale_id, product_id, size_code, delta, timestamp). Gives a clear trail for reconciliation.
- **Reconciliation report:** A report that compares, per product (and size if sized), “quantity now” vs “quantity from last count + receives − sales.” Helps find discrepancies without “leaking” data to the wrong people if the report is permissioned (e.g. manager-only).

---

**Summary:** Stock is deducted only via `record_sale`, in one transaction, with insufficient-stock checks and no negative quantities. Data access is locked down with RLS and warehouse-scoped API auth. To avoid “leaks” and keep recording accurate: use reorder level and Dashboard for replenishment, restrict who can edit product quantities, and keep server-side secrets and auth in place.
