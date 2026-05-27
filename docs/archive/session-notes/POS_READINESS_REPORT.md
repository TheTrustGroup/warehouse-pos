# POS Readiness Report — Phases 4, 5, 6

**Mindset:** Cashiers make mistakes; internet drops; two devices sell the same item; audits will happen; clients will blame the system. Correctness > speed > visuals.

**Straight talk:** The POS **does** force warehouse selection (when 2+ warehouses), scope inventory per warehouse, and atomically reduce stock (online). The **remaining gaps** below determine whether it is safe for real client use.

---

## Fixes applied (required before client use)

The following were implemented to close the mandatory gaps:

1. **Transaction persistence** — Backend now implements **POST /api/transactions**. One RPC **process_sale** inserts into `transactions` and `transaction_items`, runs `process_sale_deductions`, and writes **stock_movements** (audit trail) in one atomic transaction. Migration: `20250209200000_transactions_and_stock_movements.sql`.

2. **No silent failure** — If POST /api/transactions fails, the client **throws**; cart is **not** cleared; user sees an error toast. Sync failure shows a toast and a **pending sync count** banner on POS so the user knows transactions did not sync.

3. **Transaction POST failure** — Single call to POST /api/transactions (no separate deduct). Failure throws; no “success” when the server did not persist.

4. **Inventory traceability** — **stock_movements** table: each sale writes one row per line (transaction_id, warehouse_id, product_id, quantity_delta, reference_type 'sale'). Audits can trace “this sale caused this deduction.”

5. **Offline** — Sales cannot be completed offline (throw with clear message). No client-side-only sale completion.

**Run in Supabase:** After the atomic deduct migration, run `20250209200000_transactions_and_stock_movements.sql` (see SUPABASE_RUN_WAREHOUSE_MIGRATION.md).

---

## PHASE 4 — Multi-Warehouse Scenarios

### Same SKU in two warehouses

| Test | Result | Evidence |
|------|--------|----------|
| Same product (one `product_id`) can have stock in multiple warehouses | **Supported** | One row in `warehouse_products` per product; multiple rows in `warehouse_inventory` per (warehouse_id, product_id). Same SKU = same product_id; quantity is per warehouse. |
| Data model supports same SKU in Warehouse A and B | **Yes** | `warehouse_inventory`: (warehouse A, product P, qty 10), (warehouse B, product P, qty 5). |

### Sale in Warehouse A → Warehouse B stock unchanged

| Test | Result | Evidence |
|------|--------|----------|
| Deduction is warehouse-scoped | **Verified** | Online: POST /api/inventory/deduct sends `warehouseId`; backend `process_sale_deductions(p_warehouse_id, items)` updates only `warehouse_inventory` for that `warehouse_id`. |
| Warehouse B stock unchanged after sale in A | **Verified** | SQL updates only rows where `warehouse_id = p_warehouse_id`. No global quantity. |

### Transfer stock between warehouses

| Test | Result | Evidence |
|------|--------|----------|
| Transfer supported in UI or API | **Not supported** | Transaction type includes `'transfer'` and RecentActivity can display it, but **no** transfer flow exists: no UI to move stock A→B, no API endpoint to deduct from one warehouse and add to another. |
| **Gap** | **Documented** | To support transfers: add API (e.g. POST /api/inventory/transfer with fromWarehouseId, toWarehouseId, productId, quantity) using two atomic operations or one DB function; add UI to initiate transfer. |

### POS offline → online sync behavior

| Test | Result | Evidence |
|------|--------|----------|
| Sale when **offline** | **Sale does not complete** | When `!isOnline`, code path calls `updateProduct(...)` per item (API PUT). PUT fails with network error → `processTransaction` throws → cart not cleared, no transaction stored. So **offline sales fail** (no local-only completion). |
| Queue when **online but transaction POST fails** | **Queued for sync** | After successful deduct, if POST /api/transactions fails, transaction is stored in localStorage and enqueueOfflineTransaction. Cart is cleared; user sees success. On reconnect, syncOfflineTransactions() POSTs each queued transaction to /api/transactions. |
| Sync success/failure visible to user | **No** | syncOfflineTransactions catches errors and only `console.error`. Queue is not cleared on sync failure; user is not notified. **Silent failure** from user perspective. |
| **Gap** | **Documented** | 1) Offline: no true offline sale (deduct fails). 2) Sync failure is silent; user should be notified and/or queue shown. 3) This repo has **no** /api/transactions route — persistence depends on external backend. |

---

## PHASE 5 — Data Integrity & Accounting Safety

### Every POS sale: transaction record, warehouse ID, product IDs

| Check | Result | Evidence |
|-------|--------|----------|
| Creates a transaction record | **Conditional** | In-memory + (when online and POST succeeds) server response. When POST fails, record is only in localStorage/IndexedDB. **This repo does not implement** POST /api/transactions — an external backend must persist. So "creates" is true only if that backend exists and succeeds. |
| References a warehouse ID | **Yes** | `transaction.warehouseId` is set to `currentWarehouseId` for every sale. Payload to /api/transactions includes warehouseId. |
| References product IDs | **Yes** | `transaction.items[]` has productId, productName, sku, quantity, unitPrice, subtotal per line. |

### Inventory changes traceable

| Check | Result | Evidence |
|-------|--------|----------|
| Can trace "sale X deducted N from product P in warehouse W"? | **No** | There is **no** stock_movements or audit log table. We only UPDATE warehouse_inventory (quantity). No record of who, when, or which transaction caused the change. For audits you cannot prove "this sale caused this deduction." |
| **Gap** | **Documented** | Add stock_movements (or equivalent) table: transaction_id, warehouse_id, product_id, quantity_delta, created_at, etc., written in the same transaction as the deduct, or by the backend when it persists the sale. |

### No silent failures

| Check | Result | Evidence |
|-------|--------|----------|
| Deduct failure | **Surfaced** | 409 / INSUFFICIENT_STOCK throws; user sees "Insufficient stock...". |
| Transaction POST failure (after successful deduct) | **Silent to user** | Catch block stores transaction locally and enqueues; does not throw; cart is cleared; user sees success. So user believes sale is "saved" but server may never have received it. |
| Offline sync failure | **Silent** | syncOfflineTransactions catch only logs; user not notified; queue not cleared. |
| **Gap** | **Documented** | When transaction POST fails after deduct: either throw and do not clear cart (so user retries), or show clear warning "Sale recorded locally; will sync when server is available" and surface sync status. On sync failure, notify user and optionally show pending count. |

### No client-side-only updates

| Check | Result | Evidence |
|-------|--------|----------|
| Online deduct | **Server-side** | POST /api/inventory/deduct → DB function. No client-side-only quantity update. |
| Online transaction | **Depends on backend** | Client POSTs to /api/transactions; if backend is external and persists, record is server-side. If no backend or it fails, record is client-only (localStorage/IndexedDB). |
| Offline | **N/A** | Offline sale does not complete (network failure on updateProduct). So no client-only sale completion. |

---

## PHASE 6 — Readiness Verdict

### ✅ What is production-safe

- **Warehouse selection:** When multiple warehouses exist, user must select before add-to-cart and payment. No silent default.
- **Inventory scoped per warehouse:** Quantity read and written per warehouse_id; same SKU in two warehouses is separate stock; sale in A does not change B.
- **Atomic stock reduction (online):** Batch deduct in one DB transaction; no negative stock; concurrent-safe (atomic decrement).
- **Transaction payload:** Every sale builds a transaction with id, transactionNumber, type, items (productId, sku, quantity, unitPrice, subtotal), payments, cashier, warehouseId, createdAt, completedAt. Suitable for persistence and auditing once backend exists.
- **Deduct-before-persist order:** Inventory is reduced first; only then is the transaction sent. No "sale recorded but stock not reduced" if client follows the flow.

### ⚠️ What is risky

- **Transaction persistence:** This repo has **no** /api/transactions. If the client points at an API that doesn’t persist transactions, sale records exist only in the browser (localStorage/IndexedDB). Sync can fail silently. **Risk:** Lost sales for accounting and disputes.
- **Transaction POST failure after deduct:** User still sees success and cleared cart; record is only local. **Risk:** Accounting thinks the sale didn’t happen; inventory is already reduced.
- **Offline:** Sales do not complete when offline (network failure on deduct). **Risk:** Lost sales during outages unless you add a true offline mode (e.g. local deduct + queue and reconcile later).
- **No inventory audit trail:** No stock_movements or equivalent. **Risk:** Audits cannot trace a specific sale to a specific inventory change.

### ❌ What will break in real retail usage

- **No durable transaction store in this codebase:** If no external backend implements POST /api/transactions and persists with warehouseId and items, every sale is only in the browser. Device loss or clear data = lost sales records. **Will break:** accounting, tax, and dispute resolution.
- **Sync failure is silent:** User may believe queued transactions are "synced" when they are not. **Will break:** trust and reconciliation.
- **No transfer flow:** Stores that move stock between locations cannot do it in the system. **Will break:** multi-location operations that rely on transfers.

### Required fixes before client use

1. **Transaction persistence (mandatory)**  
   - Implement or connect to a backend that **persists** every sale: e.g. POST /api/transactions that writes to a `transactions` (and optionally `transaction_items`) table with warehouse_id, product IDs, amounts, timestamps.  
   - Ensure this repo’s front-end calls that endpoint and that failure is **visible** (do not clear cart and show success when POST fails, or show explicit "Saved locally; sync pending" and sync status).

2. **No silent sync failure**  
   - When syncOfflineTransactions fails, notify the user (toast/banner) and optionally show "X transactions pending sync."  
   - Do not clear the queue on failure without user awareness.

3. **Transaction POST failure after deduct**  
   - Either: (a) throw and do not clear cart so the user retries, or (b) clear cart but show a clear warning that the sale is "saved locally" and will sync, and surface sync status. Prefer (a) unless you have a robust offline/sync story.

4. **Inventory traceability (strongly recommended)**  
   - Add a stock_movements (or equivalent) table and write a row per deduction (transaction_id, warehouse_id, product_id, quantity_delta, created_at). Either in the same transaction as the deduct or when the backend persists the sale. Enables audits and "this sale caused this inventory change."

5. **Transfer (if business needs it)**  
   - Add transfer API and UI so stock can move between warehouses in a controlled, auditable way.

---

## Summary: Can the client use it?

| Criterion | Met? |
|-----------|------|
| Force warehouse selection | ✅ Yes (when 2+ warehouses). |
| Scope inventory per warehouse | ✅ Yes. |
| Atomically reduce stock | ✅ Yes (online, via POST /api/inventory/deduct). |

So the **inventory and warehouse behavior** are in place. The **blockers for real client use** are:

- **No durable transaction record** in this system (depends on external backend and/or implementing /api/transactions with persistence).
- **Silent failure** when transaction POST or sync fails (user thinks sale is saved when it may not be).
- **No audit trail** linking sales to inventory changes.

**Recommendation:** Do **not** let a client use this for real retail until:

1. Every sale is persisted to a durable store (DB) with warehouse ID and product IDs, and  
2. Failures to persist or sync are **not** silent (user is informed and/or cart not cleared on failure), and  
3. (Recommended) Inventory changes are traceable (e.g. stock_movements or equivalent).

That’s not pessimism — it’s professional responsibility: correctness over speed and visuals.
