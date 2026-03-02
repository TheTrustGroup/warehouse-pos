# Data integrity and robustness

**Purpose:** How the system handles race conditions, failed sales, auditability, and recovery.

---

## 1. Sale recording and stock deduction

- **Primary path:** `POST /api/sales` calls the `record_sale` RPC. The RPC runs in a single database transaction: insert sale + lines, then deduct stock. If any step fails (including insufficient stock), the whole sale is rolled back.
- **Insufficient stock:** The RPC checks available quantity before deducting. If a line would make stock negative, it raises `INSUFFICIENT_STOCK` and the API returns **409** with a clear message. The frontend should show “Insufficient stock” and let the cashier adjust or remove the line.
- **Manual fallback:** If the RPC is missing (e.g. migration not applied), the API uses a JavaScript fallback that inserts sale and lines and then updates inventory in multiple round-trips. This path is **not atomic**: a failure mid-way can leave a sale with partial or no stock deduction. Use only when the RPC cannot be deployed; ensure `record_sale` is present in production.

---

## 2. Race conditions (two cashiers, last unit)

- **In database:** The updated `record_sale` checks stock **inside** the same transaction before deducting. Two concurrent sales for the last unit: the first commits, the second fails with `INSUFFICIENT_STOCK` and rolls back. No negative inventory.
- **Manual fallback:** No lock; read-then-update can still allow oversell. Prefer the RPC in production.

---

## 3. Idempotency

- **In-memory:** `POST /api/sales` supports `Idempotency-Key`. When the same key is sent again within the TTL (5 minutes), the cached success response is returned and no second sale is recorded. Stored per API instance only.
- **Limitation:** Duplicate requests to different instances (e.g. multiple Vercel regions) can both succeed. For strict cross-instance deduplication, use a shared store (e.g. Redis or a DB table keyed by idempotency key).

---

## 4. Audit and traceability

- **Sales:** Each row in `sales` has `created_at`; `sold_by` (UUID) is supported by the RPC but currently passed as null from the API. To log who sold what, add mapping from session (e.g. auth user id/email) to `sold_by` or a separate `sold_by_email` column and pass it into the RPC.
- **Stock:** Inventory tables use `updated_at`. For full audit of every change, consider a `stock_movements` (or similar) table populated from the same transaction as the deduction.

---

## 5. Failed POS and disconnect

- **Before sale is submitted:** Cart is in memory only. Browser close or network drop loses the cart; no server rollback needed.
- **After POST /api/sales, before response:** If the request times out or the connection drops, the client cannot know whether the RPC committed. The cashier may retry; with **Idempotency-Key** (same key as first attempt), the second request returns the cached response and does not double-deduct. Always send a stable idempotency key per “logical” sale (e.g. client-generated UUID) from the POS.
- **After 2xx response:** Sale is committed. If the browser crashes before showing the receipt, the sale still exists; the cashier can look up by receipt id or time in the sales list.

---

## 6. Backups

- **Supabase:** Use Supabase Dashboard → Database → Backups (or point-in-time recovery if enabled). Schedule and test restores.
- **Application:** No application-level backup of sales; the database is the source of truth.

---

## Checklist for production

- [ ] Apply migration `20260301100000_record_sale_insufficient_stock.sql` so all sales use the insufficient-stock check.
- [ ] Ensure POS sends `Idempotency-Key` on every sale submission (one key per “checkout attempt”).
- [ ] Handle 409 from `POST /api/sales` in the UI (show “Insufficient stock” and allow editing cart).
- [ ] Configure Supabase backups and verify restore.
- [ ] (Optional) Add `sold_by` or `sold_by_email` from session to sales for audit.
