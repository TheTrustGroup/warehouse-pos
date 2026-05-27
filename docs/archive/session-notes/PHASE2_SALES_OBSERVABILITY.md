# Phase 2: Sales Observability

**Goal:** Make sales a first-class backend concept so admins can see server-backed sales per warehouse, store, POS, and operator—without changing existing behavior, data, or APIs.

**Constraints honored:** No inventory mutations, no table/column renames, no new required request fields, no backfill, no session resets. Additive only.

---

## What Was Added

### 1. Database (additive only)

- **Migration:** `20250209400000_phase2_transactions_observability.sql`
  - **Nullable columns** on `transactions` (no NOT NULL, no defaults, no backfill):
    - `store_id` (uuid, nullable)
    - `pos_id` (text, nullable)
    - `operator_id` (uuid, nullable)
  - **Indexes** for filtered list queries: `store_id`, `pos_id`, `operator_id` (partial, where not null).
  - **`process_sale` RPC** extended with optional parameters: `p_store_id`, `p_pos_id`, `p_operator_id` (default null). Existing callers that do not pass these still work; new rows get NULL in new columns.

### 2. Server-side derivation (safe)

When creating a transaction (POST /api/transactions):

- `store_id` ← `session.store_id` (if present)
- `pos_id` ← `session.device_id` (if present)
- `operator_id` ← left NULL (session has no user uuid today; can be populated later)
- `warehouse_id` ← unchanged (Phase 1: session or body)

If any session field is missing, the corresponding column stays NULL. No blocking, no errors.

### 3. Read-only APIs (new)

- **GET /api/transactions** (admin only)
  - **Auth:** `requireAdmin` — non-admins receive 403.
  - **Query params:** `warehouse_id`, `store_id`, `pos_id`, `from`, `to`, `limit`, `offset`.
  - **Response:** `{ data: Transaction[], total: number }`. Sorted by `created_at` DESC. Pagination: default limit 50, max 200.
  - **Cache:** `Cache-Control: private, max-age=60`.
  - **No mutation:** Read-only; no writes.

- **GET /api/stock-movements** (admin only)
  - **Auth:** `requireAdmin`.
  - **Query params:** `warehouse_id`, `transaction_id`, `from`, `to`, `limit`, `offset`.
  - **Response:** `{ data: StockMovement[], total: number }`. Read-only; no writes.

### 4. Admin dashboard and reports

- **Reports (sales):**
  - Admins: sales data is loaded from **GET /api/transactions** for the selected date range (server = all devices).
  - Non-admins or on API failure: fallback to **localStorage** (this device only). No blank screen.
  - UI shows: "Showing sales from server (all devices)." or "Showing sales from this device."

- **Dashboard:**
  - Admins: "Today's Sales" and "Today's Transactions" are filled from **GET /api/transactions** (today 00:00–now). On failure, values stay 0.
  - Non-admins: values remain 0 (unchanged).

### 5. Performance

- List queries use existing and new indexes (`warehouse_id`, `created_at`, `store_id`, `pos_id`, `operator_id`).
- Single query for transactions + single query for `transaction_items` by `transaction_id` (no N+1).
- GET /api/transactions is cached briefly (60s) to reduce load.
- POS checkout path is unchanged (same POST /api/transactions; no extra round-trips).

---

## What Was Intentionally NOT Changed

- **Inventory:** No changes to `warehouse_inventory` or `warehouse_products`. No quantity updates, no new deduction logic.
- **Existing APIs:** POST /api/transactions request/response shape unchanged. No new required body fields.
- **Existing rows:** No backfill, no UPDATEs on old transactions. Pre–Phase 2 rows have NULL in new columns.
- **Sessions / roles:** No reset, no new required session fields. Optional session binding (Phase 1) unchanged.
- **POS checkout:** Flow and performance unchanged; only extra server-derived columns written when session has store_id/device_id.

---

## Why This Is Safe for Production

1. **Additive schema:** Only new nullable columns and new indexes. No drops, renames, or NOT NULL.
2. **Backward compatible RPC:** `process_sale` accepts the same three arguments as before; the fourth, fifth, and sixth are optional and default to null. Existing callers (e.g. older backends) remain valid.
3. **No client trust:** store_id, pos_id, operator_id are set only from server session. Client cannot override them.
4. **Read-only visibility:** GET /api/transactions and GET /api/stock-movements do not modify data. Admin-only enforcement prevents privilege escalation.
5. **Graceful degradation:** Reports and Dashboard fall back to localStorage or zeros when the API is unavailable or user is not admin. No blank screens, no hard errors.

---

## How Admin Visibility Works Now

1. **Cashier completes a sale** → POST /api/transactions (unchanged) → transaction stored with `warehouse_id` and, when present in session, `store_id`, `pos_id`; `operator_id` remains NULL until user ids are available in session.
2. **Admin opens Reports** → Frontend calls GET /api/transactions with date range → server returns all transactions in range (all devices) → report is generated from server data.
3. **Admin opens Dashboard** → Frontend calls GET /api/transactions for today → today’s sales and transaction count shown.
4. **Filtering:** Admin can pass `warehouse_id`, `store_id`, or `pos_id` to GET /api/transactions to see sales per warehouse, store, or POS device. No new UI was added for these filters in Phase 2; the API is ready for future admin filters.

---

## Files Touched

| Area | Files |
|------|--------|
| Migration | `inventory-server/supabase/migrations/20250209400000_phase2_transactions_observability.sql` |
| Transaction write | `inventory-server/lib/data/transactions.ts` (processSale + sessionContext, listTransactions) |
| Transaction API | `inventory-server/app/api/transactions/route.ts` (GET admin list, POST unchanged + sessionContext) |
| Stock movements | `inventory-server/lib/data/stockMovements.ts`, `inventory-server/app/api/stock-movements/route.ts` |
| Frontend | `src/services/transactionsApi.ts`, `src/pages/Reports.tsx`, `src/pages/Dashboard.tsx` |
| Doc | `warehouse-pos/PHASE2_SALES_OBSERVABILITY.md` |

---

## Verification Checklist

- [ ] Cashier completes a sale → transaction stored (existing flow).
- [ ] Admin logs in on another device → sees sale in Reports (server data).
- [ ] Filtering by warehouse (and store/pos when UI exists) works via GET /api/transactions.
- [ ] Old sales (pre–Phase 2) still visible (new columns NULL).
- [ ] Inventory quantities unchanged (no new deduction or adjustment logic).
- [ ] POS checkout speed unchanged (same single POST, no extra required work).
