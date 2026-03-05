# Procedure: clearing sales and delivery history

Clearing all sales and sale_lines is a **destructive, one-time** operation (e.g. before going live with real data). It must be explicit and audited.

---

## Preferred: Admin API

1. Log in as an **admin** or **super_admin**.
2. Open Sales History (or use any client that can call the admin API).
3. Use “Clear sales & delivery history” (or equivalent). The client sends:
   - `POST /api/admin/clear-sales-history`
   - Body: `{ "confirm": "CLEAR_ALL_SALES" }`
   - With session cookie or Bearer token (admin).
4. The server will:
   - Enforce admin role.
   - Reject the request if the body is missing or `confirm` is not exactly `CLEAR_ALL_SALES`.
   - Call the `clear_sales_history()` RPC (truncate sale_lines and sales, reset receipt_seq).
   - Log: `[AUDIT] clear_sales_history executed by admin email=... at <ISO timestamp>`.

This is the only method that produces an audit log in application logs.

---

## Fallback: Manual SQL (emergency only)

Use only when the API is unavailable. No application audit log is written.

1. Open the SQL file: `inventory-server/supabase/scripts/clear_sales_manual.sql`.
2. Follow the instructions there:
   - Optionally set `statement_timeout`.
   - Run the batched `DELETE FROM sale_lines ...` repeatedly until it returns 0 rows.
   - Run the batched `DELETE FROM sales ...` repeatedly until 0 rows.
   - Run `SELECT setval('receipt_seq', 1);` once.

The migration file `20260305220000_clear_sales_and_delivery_history.sql` does **not** run any of these DELETEs; it only documents the two options above so that applying migrations never clears data.
