# Phase 2 — Forensic Audit Report
## Warehouse Inventory & POS — warehouse.extremedeptkidz.com

**Date:** 2025-03-05  
**Scope:** Deliveries history, product sizes vanishing, reports/financials, cross-cutting wiring  
**Stack:** Vite + React (warehouse-pos/), Next.js API (inventory-server/), Supabase (PostgreSQL + RLS)

---

# DELIVERIES INVESTIGATION

## A. Data flow traced

**“Deliveries” in this app = sales with delivery tracking.** There is no separate `deliveries` table.

**Sales table schema (delivery-related columns from migrations):**
- From `warehouse-pos/supabase/migrations/DELIVERY_MIGRATION.sql` and `ADD_DELIVERY_CANCELLED.sql`:
  - `delivery_status` text NOT NULL DEFAULT 'delivered' — values: `'delivered' | 'pending' | 'dispatched' | 'cancelled'`
  - `recipient_name`, `recipient_phone`, `delivery_address`, `delivery_notes` text
  - `expected_date` date, `delivered_at` timestamptz, `delivered_by` text  
- Plus core columns: `id`, `warehouse_id`, `receipt_id`, `customer_name`, `payment_method`, `subtotal`, `discount_pct`, `discount_amt`, `total`, `item_count`, `status`, `sold_by_email`, `created_at`, etc.

**API that fetches “deliveries”:**
- **Route:** `inventory-server/app/api/sales/route.ts` — GET only (no PATCH).
- **Exact query today:**  
  `supabase.from('sales').select('id, warehouse_id, customer_name, payment_method, subtotal, discount_pct, discount_amt, total, receipt_id, status, sold_by_email, item_count, created_at').eq('warehouse_id', effectiveWarehouseId).order('created_at', { ascending: false }).limit(limit)`  
  Optional: `.gte('created_at', from)` when `from` is provided.
- **Critical:** The `pending=true` query param is **ignored**. Delivery columns (`delivery_status`, `recipient_name`, `recipient_phone`, `delivery_address`, `delivery_notes`, `expected_date`, `delivered_at`, `delivered_by`) are **not selected**.
- **Response shape:** `NextResponse.json(list)` — the response body is the **array at root**, not `{ data: list }`.

**Component that renders the deliveries list:**
- **File:** `warehouse-pos/src/pages/DeliveriesPage.tsx`
- **Fetch:** `GET ${base}/api/sales?warehouse_id=${encodeURIComponent(warehouseId)}&limit=200&pending=true`
- **State set:** `setDeliveries((json.data ?? []) as Delivery[])` (line ~295).

**Exact condition that shows “No deliveries scheduled yet”:**
- **Condition:** `!loading && !error && filtered.length === 0` (line ~434).
- **Title:** If `search` → "No results"; else if `filter === 'cancelled'` → "No cancelled deliveries"; **else** → **"No pending deliveries"**.
- **Subtitle:** If no search and not cancelled → **"Deliveries scheduled from the POS will appear here"**.

## B. Root cause of missing deliveries

**Primary cause — response shape:**  
The API returns the array at the **root** of the JSON body. The frontend always reads `json.data`, which is **undefined**. So `(json.data ?? [])` is always `[]`, and the page always shows the empty state (“No pending deliveries”) even when sales/deliveries exist in the DB.

**Secondary causes:**
1. **No delivery filter:** GET /api/sales does not honour `pending=true` (no filter on `delivery_status IN ('pending','dispatched','cancelled')`).
2. **No delivery columns in select:** So even if the list were returned, each row would lack `deliveryStatus`, `recipientName`, `recipientPhone`, `deliveryAddress`, `deliveryNotes`, `expectedDate`, `deliveredAt`, `deliveredBy` — the UI expects these for the Delivery type.
3. **PATCH not implemented:** Mark Dispatched / Mark Delivered / Cancel call `PATCH /api/sales` with `{ saleId, deliveryStatus, warehouseId }`, but the sales route only exports GET and POST, so PATCH returns 405.

**Data status (inference):**
- **Deliveries (sales with delivery_status pending/dispatched/cancelled) almost certainly exist in the DB** if users have ever scheduled deliveries from the POS. The issue is **visibility**: the wrong response shape and missing columns/filter prevent them from appearing.
- **Visible with correct query:** If you run in Supabase SQL Editor:
  - `SELECT COUNT(*) FROM sales WHERE delivery_status IN ('pending','dispatched','cancelled');`  
  you will see whether any delivery rows exist. The current API query returns **all** sales (up to limit) but the frontend throws them away because it reads `json.data`.

## C. Diagnostic queries (run in Supabase SQL Editor)

Use these **read-only** queries; adjust if your schema differs (e.g. different table name). **Do not modify data.**

```sql
-- How many sales have delivery_status other than 'delivered'?
SELECT COUNT(*) AS total_delivery_sales
FROM sales
WHERE delivery_status IN ('pending', 'dispatched', 'cancelled');

-- Per warehouse: delivery counts and statuses
SELECT
  warehouse_id,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest,
  array_agg(DISTINCT delivery_status) AS statuses
FROM sales
WHERE delivery_status IN ('pending', 'dispatched', 'cancelled')
GROUP BY warehouse_id;

-- Total sales vs delivery-tracked (sanity check)
SELECT
  COUNT(*) AS total_sales,
  COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
  COUNT(*) FILTER (WHERE delivery_status IN ('pending', 'dispatched')) AS pending_or_dispatched,
  COUNT(*) FILTER (WHERE delivery_status = 'cancelled') AS cancelled
FROM sales;
```

## D. Restoration plan

**No data restoration needed** if the above counts show rows. The data is in `sales`; it is not shown because of API/frontend bugs.

**Fixes required (code, no SQL data change):**

1. **Response shape (choose one):**
   - **Option A:** In GET `/api/sales`, return `NextResponse.json({ data: list })` so the frontend’s `(json.data ?? [])` works; **or**
   - **Option B:** In DeliveriesPage, set state from the root array when present:  
     `setDeliveries((Array.isArray(json) ? json : json?.data ?? []) as Delivery[])`.
2. **Deliveries-specific GET behaviour when `pending=true`:**
   - Add delivery columns to the select:  
     `delivery_status, recipient_name, recipient_phone, delivery_address, delivery_notes, expected_date, delivered_at, delivered_by`.
   - When `searchParams.get('pending') === 'true'`, filter:  
     `.in('delivery_status', ['pending','dispatched','cancelled'])`  
     (and optionally extend to include ‘delivered’ for “history” view if needed).
   - Map DB snake_case to the Delivery interface (e.g. `deliveryStatus`, `recipientName`, …).
3. **Implement PATCH /api/sales** for updating `delivery_status` (and optionally `delivered_at`, `delivered_by`) so Mark Dispatched / Delivered / Cancelled work.
4. **Ensure `record_sale` (or POS flow) sets `delivery_status` and delivery fields** when a sale is created as a scheduled delivery (e.g. `'pending'`, recipient/address). If those columns are never set, new scheduled deliveries will still not appear until that write path is fixed.

---

# VANISHING SIZES INVESTIGATION

## A. Write paths that touch product/size data

| Operation | Where | Tables/columns written | How |
|-----------|--------|-------------------------|-----|
| **Add new product with sizes** | `warehouseProducts.ts` `createWarehouseProduct()` | `warehouse_products` INSERT; `warehouse_inventory` INSERT; `warehouse_inventory_by_size` INSERT per size | Single INSERT path; no delete. Safe. |
| **Edit existing product** | `warehouseProducts.ts` `updateWarehouseProduct()` **and** RPC `update_warehouse_product_atomic` (used by `app/api/products/[...id]/route.ts`) | `warehouse_products` UPDATE; `warehouse_inventory_by_size` **DELETE all** for (warehouse_id, product_id) then **INSERT** new rows; `warehouse_inventory` DELETE then INSERT (or UPSERT in RPC) | **Destructive:** full DELETE of by_size then INSERT. If the set of sizes sent is empty or incomplete, sizes are permanently lost. |
| **Edit product sizes/quantities** | Same as “Edit existing product” | Same | Same DELETE+INSERT. |
| **Complete a POS sale (stock deduction)** | RPC `record_sale` (called by POST /api/sales) | `sales` INSERT; `sale_lines` INSERT; `warehouse_inventory_by_size` or `warehouse_inventory` UPDATE (quantity decrease) | No delete of size rows; only quantity update. Safe. |
| **Receive a delivery (stock addition)** | No dedicated “receive delivery” RPC. Stock is added via **product update** (edit product / manual adjustment). | Same as “Edit existing product” | DELETE+INSERT on by_size. If payload omits existing sizes or sends empty list, those sizes are lost. |
| **Manual stock adjustment** | Same as “Edit existing product” (PUT/PATCH /api/products/:id or PUT /api/products) | Same | Same DELETE+INSERT. |

So **every path that “updates” product or quantity** (edit product, edit sizes, receive delivery, manual adjustment) goes through either:
- `updateWarehouseProduct()` in `warehouseProducts.ts`, or  
- `update_warehouse_product_atomic` (and fallback `manualUpdate`) in `app/api/products/[...id]/route.ts`.  

Both use **DELETE all `warehouse_inventory_by_size` for that product/warehouse, then INSERT the new set**. If the new set is empty or incomplete, sizes vanish.

## B. Destructive pattern (confirmed)

- **RPC `update_warehouse_product_atomic`** (`20250213000000_atomic_product_inventory_rpc.sql`, lines 121–133):  
  `DELETE FROM warehouse_inventory_by_size WHERE warehouse_id = p_warehouse_id AND product_id = p_id;`  
  then loop INSERT. So **full replace**: any size not in `p_quantity_by_size` is removed. If `p_quantity_by_size` is `[]` or null and the caller then sets quantity only, by_size stays empty.
- **manualUpdate** in `app/api/products/[...id]/route.ts` (lines 355–366):  
  Same: delete all by_size for (wid, id), then insert from `sizeRows`.  
- **updateWarehouseProduct** in `warehouseProducts.ts` (lines 416–439):  
  Same: delete by_size and warehouse_inventory, then insert.

**Frontend payload risk:**  
- In `warehouseProducts.ts`, when `bodySizes !== null` (client sent `quantityBySize`), the server uses that array as the full source of truth; when it’s `[]`, the code treats it as “clear all sizes” and may leave only `warehouse_inventory` with a total. If the frontend ever sends `quantityBySize: []` by mistake (e.g. only sending “changed” sizes or a bug), all size rows are deleted.  
- The product route’s `parseRawSizes(body)` and RPC pass-through also treat the received array as the full set.

**No evidence found of:**  
- Scheduled job/cron deleting inventory.  
- Cascade delete on product update (product row is updated in place, not re-created).  
- RLS that hides by_size rows over time.  
- Reconciliation step after delivery that overwrites sizes incorrectly (reconciliation in `20260304140000_reconcile_warehouse_inventory_from_sizes.sql` only sets `warehouse_inventory.quantity` from SUM(by_size); it does not delete by_size rows).

## C. Diagnostic queries (run in Supabase SQL Editor)

Table names assumed: `warehouse_products` (wp), `warehouse_inventory_by_size` (wis), `warehouse_inventory` (wi). Adjust if your schema uses different names.

```sql
-- Products with zero size records (sized products with no by_size rows)
SELECT
  wp.id,
  wp.name,
  wp.size_kind,
  (SELECT quantity FROM warehouse_inventory wi WHERE wi.product_id = wp.id LIMIT 1) AS total_quantity,
  COUNT(wis.id) AS size_record_count
FROM warehouse_products wp
LEFT JOIN warehouse_inventory_by_size wis ON wis.product_id = wp.id
GROUP BY wp.id, wp.name, wp.size_kind
HAVING wp.size_kind = 'sized' AND COUNT(wis.id) = 0
ORDER BY wp.name;

-- Phantom stock: warehouse_inventory.quantity != SUM(warehouse_inventory_by_size.quantity)
SELECT
  wp.id,
  wp.name,
  wi.quantity AS stored_total,
  COALESCE(SUM(wis.quantity), 0) AS actual_from_sizes,
  wi.quantity - COALESCE(SUM(wis.quantity), 0) AS phantom_units
FROM warehouse_products wp
JOIN warehouse_inventory wi ON wi.product_id = wp.id
LEFT JOIN warehouse_inventory_by_size wis ON wis.product_id = wp.id AND wis.warehouse_id = wi.warehouse_id
GROUP BY wp.id, wp.name, wi.warehouse_id, wi.quantity
HAVING wi.quantity IS DISTINCT FROM COALESCE(SUM(wis.quantity), 0)
ORDER BY phantom_units DESC;

-- Size records with negative or NULL quantity
SELECT wis.*, wp.name AS product_name
FROM warehouse_inventory_by_size wis
JOIN warehouse_products wp ON wp.id = wis.product_id
WHERE wis.quantity < 0 OR wis.quantity IS NULL;

-- Orphaned size records (no parent product)
SELECT wis.*
FROM warehouse_inventory_by_size wis
LEFT JOIN warehouse_products wp ON wp.id = wis.product_id
WHERE wp.id IS NULL;
```

**Interpretation:**  
- First query: sized products with no by_size rows → likely lost via DELETE+INSERT.  
- Second: drift between `warehouse_inventory.quantity` and sum of by_size → reconcile with existing migration or trigger.  
- Third/fourth: data integrity issues to fix.

## D. Fix plan (vanishing sizes)

1. **Replace DELETE+INSERT with UPSERT for `warehouse_inventory_by_size`**  
   - In RPC: instead of `DELETE ... ; INSERT ...`, use `INSERT ... ON CONFLICT (warehouse_id, product_id, size_code) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at` for each size in the payload.  
   - **Only delete** a size row when the payload explicitly indicates that size was removed (e.g. size no longer in the list for a “sized” product). So:  
     - Compute the set of size_codes from the payload.  
     - Delete only `WHERE warehouse_id = ? AND product_id = ? AND size_code NOT IN (payload size codes)`.  
     - Then UPSERT the payload sizes.  
   - Apply the same logic in `manualUpdate` and, if still used for some path, in `updateWarehouseProduct` (or delegate to one implementation).

2. **Sync `warehouse_inventory.quantity` from sizes**  
   - After any by_size change, set `warehouse_inventory.quantity = SUM(warehouse_inventory_by_size.quantity)` for that (warehouse_id, product_id).  
   - Prefer doing this in the DB (trigger or inside the same RPC) so it cannot be missed. The existing migration `20260304140000_reconcile_warehouse_inventory_from_sizes.sql` is a one-time fix; a trigger or RPC step keeps it correct going forward.

3. **Database constraints**  
   - `quantity >= 0` on `warehouse_inventory` and `warehouse_inventory_by_size` (if not already).  
   - `NOT NULL` on `size_code` and `product_id` in `warehouse_inventory_by_size` (if not already).

4. **Reconcile existing drifted data**  
   - Run the reconciliation that sets `warehouse_inventory.quantity = SUM(warehouse_inventory_by_size.quantity)` where they differ (already provided in `20260304140000_reconcile_warehouse_inventory_from_sizes.sql`). For products with `size_kind = 'sized'` and zero by_size rows but non-zero inventory quantity, either backfill by_size from a snapshot if available, or set inventory to 0 and flag for manual review — **show the exact SQL before running.**

---

# REPORTS AND FINANCIALS

## A. Current reports audit

**Reports page:** `src/pages/Reports.tsx`. Two tabs: “Sales Report” and “Inventory Report”.

**Data source for sales report:**  
- **GET /api/transactions** (date range, optional warehouse_id).  
- **Backend:** `listTransactions()` in `inventory-server/lib/data/transactions.ts` reads from **`transactions`** and **`transaction_items`** (not from `sales` / `sale_lines`).

**Critical finding — two separate systems:**  
- **POS records sales via POST /api/sales** → `record_sale` RPC → writes to **`sales`** and **`sale_lines`**.  
- **Reports read from GET /api/transactions** → **`transactions`** and **`transaction_items`**.  
So **if the only way sales are recorded is POST /api/sales, the transactions table may be empty or stale**, and the Reports page will show no or incomplete sales. Sales History and Deliveries use GET /api/sales (correct). Reports use a different table.

**Current metrics (sales) — all computed in JS in `reportService.ts`:**

| Metric | Calculation | Uses selling_price / cost_price | Where |
|--------|-------------|--------------------------------|-------|
| Total Revenue | Sum of `t.total` per transaction (filtered by date, status === 'completed', exclude mock) | N/A (total) | reportService.ts |
| Total Profit | Per item: `(item.unitPrice - product.costPrice) * quantity`; product from current `products` list | **Current** product.costPrice (wrong for history) | reportService.ts |
| Transactions | Count of filtered transactions | — | reportService.ts |
| Items Sold | Sum of item quantities | — | reportService.ts |
| Avg Order Value | totalRevenue / totalTransactions | — | reportService.ts |
| Profit Margin % | (totalProfit / totalRevenue) * 100 | profit uses current cost | reportService.ts |

**Current metrics (inventory):**  
- Total Products, Total Stock Value (cost × quantity), Low Stock, Out of Stock, by category, top value — all from `products` (useInventory()) in JS. Stock value uses current cost.

**Correct today:**  
- Total Revenue (if data source had the right rows).  
- Total Transactions, Items Sold, Avg Order Value (same caveat).  
- Inventory counts and stock value from current product list (for current snapshot).

**Wrong or misleading:**  
- **Total Profit / Profit Margin:** Uses **current** `product.costPrice` for every historical line. If cost changed, historical profit is wrong.  
- **Data source:** Reports use `transactions`; actual POS sales may be only in `sales`. So revenue/profit/counts can be incomplete or zero.

**Missing (vs your spec):**  
- COGS explicitly (Total Cost of Goods Sold).  
- Gross Profit = Revenue − COGS (we have “Total Profit” but wrong formula).  
- Net Profit (excl. operating costs).  
- Current stock value at selling price; potential gross profit in stock.  
- Period comparisons (this period vs last period).  
- Top 5 by profit margin; slowest movers.  
- Standard period filters (Today, This week, Last month, 3/6 months, Year, Custom).  
- Sales history table with expandable line items and **cost at time of sale**.  
- Alerts (out of stock, low stock, no cost price).  
- All metrics computed in SQL (currently JS over fetched data).  
- Currency symbol GH₵ and divide-by-zero safety everywhere.

## B. Schema gaps (cost at time of sale)

- **sale_lines** (used by POST /api/sales): Columns include `product_id`, `size_code`, `product_name`, `product_sku`, `unit_price`, `qty`, `line_total`, `product_image_url`, `created_at`. **No `cost_price` or `cost_price_at_time_of_sale`.**  
- **transaction_items** (used by Reports): Columns include `product_id`, `product_name`, `sku`, `quantity`, `unit_price`, `subtotal`. **No cost column.**  
- So **neither** table stores cost at time of sale. All profit/COGS calculations that use “current product cost” are wrong for history when cost has changed.

**Required:**  
- Add `cost_price` (or `cost_price_at_time_of_sale`) to the table that backs **reported** sales. If reports are to be driven by **sales** (recommended for single source of truth), add it to **sale_lines**, populate it in `record_sale` from `warehouse_products.cost_price` at insert time, and use it in all COGS/profit calculations. If reports stay on **transactions**, add cost to **transaction_items** and set it in `process_sale`.

## C. Rebuild scope (reports)

- **Unify data source:** Either (1) make Reports use **sales + sale_lines** (same as Sales History and POS) and add cost to sale_lines, or (2) keep transactions and ensure every POS sale also writes to transactions (and add cost to transaction_items). Recommendation: **Option 1** — use sales for reports, add cost to sale_lines, add a dedicated reports API that queries sales/sale_lines with period filters and returns metrics in SQL.
- **Backend:** New endpoint(s) that compute revenue, COGS, gross profit, margin, counts, top products, etc. in SQL (SUM/COUNT/AVG, period filters). Return pre-aggregated metrics and optionally paginated sales list with line-level cost.
- **Frontend:** Rebuild Reports UI to your spec: period selector, key metrics row (Revenue, COGS, Gross Profit, Net Profit), inventory snapshot, revenue chart, top products table, sales history table (expandable, CSV export), alerts. All numbers from API; no JS aggregation over full lists. Enforce GH₵, 1 decimal for %, zero states, divide-by-zero checks.

---

# CROSS-CUTTING WIRING

- **After a delivery is received (stock addition):** There is no dedicated “receive delivery” flow. Stock is increased by **editing the product** (same as manual adjustment). So: inventory updates when the product update succeeds; dashboard will reflect new stock after cache invalidation (`notifyInventoryUpdated`); deliveries page shows “delivered” only when PATCH /api/sales is implemented and the sale’s `delivery_status` is updated. Currently PATCH is missing.  
- **After a sale:** POST /api/sales → record_sale deducts from warehouse_inventory_by_size or warehouse_inventory; `notifyInventoryUpdated(warehouseId)` is called, so dashboard cache is invalidated. Inventory and dashboard stay in sync. Sales do **not** appear in Reports if Reports only read from transactions.  
- **After editing a product:** Product and inventory (and by_size) are updated; dashboard is invalidated. Reports use current product prices for **inventory** metrics; for **sales** metrics they use transaction_items (or would use sale_lines) — if cost is stored at time of sale, historical reports stay correct; if not, they use current cost and are wrong.

---

# PRIORITY ORDER FOR FIXES

| Priority | Item | Effort |
|----------|------|--------|
| **P0 — Data visibility / restoration** | Fix deliveries visibility: response shape + delivery columns + pending filter + PATCH (no data restore if data exists in sales). | S |
| **P0** | Unify or fix reports data source: either Reports use sales (and add cost to sale_lines) or ensure transactions is populated and add cost to transaction_items. | M |
| **P1 — Broken core flows** | Fix vanishing sizes: UPSERT by_size, delete only explicitly removed sizes, sync warehouse_inventory from by_size (trigger or RPC), then run reconciliation. | M |
| **P1** | Add cost_price to sale_lines (or transaction_items); populate in record_sale (or process_sale); use in all COGS/profit calculations. | S |
| **P2 — Missing features** | Rebuild reports API (SQL metrics, period filters) and Reports UI to full spec (metrics, chart, tables, alerts, CSV, mobile). | L |
| **P2** | Database constraints: quantity >= 0, NOT NULL on size_code/product_id where missing. | XS |
| **P3 — Enhancements** | Period comparisons, slowest movers, alerts summary, full mobile pass. | M |

---

# DIAGNOSTIC QUERIES — SUMMARY

Run these in **Supabase SQL Editor** (read-only). Results will tell you:

1. **Deliveries:** Whether any sales have delivery_status pending/dispatched/cancelled and per-warehouse counts.  
2. **Sizes:** How many sized products have zero by_size rows; how many rows have phantom stock (inventory.quantity ≠ sum(by_size)); negative/NULL quantities; orphaned by_size rows.

---

# PHASE 3 EXECUTION SUMMARY (2025-03-05)

The following was implemented after approval. **Migrations must be run in Supabase** before full verification.

## Completed

**STEP 1 — Deliveries visibility**
- Frontend (`DeliveriesPage.tsx`): accept response as array at root or `{ data }`.
- GET `/api/sales`: when `pending=true`, filter by `delivery_status IN ('pending','dispatched','cancelled')`; select delivery columns; map to camelCase; fallback if delivery columns missing.
- PATCH `/api/sales`: update `delivery_status` (and `delivered_at` / `delivered_by` when marking delivered); scope-checked by warehouse.

**STEP 2 — Vanishing sizes**
- Migration `20260305120000_upsert_by_size_prevent_vanishing.sql`: RPC `update_warehouse_product_atomic` now UPSERTs by_size (delete only payload-removed codes); CHECK (quantity >= 0) on inventory tables.
- `warehouseProducts.ts` `updateWarehouseProduct`: delete only size_codes not in payload, then upsert payload sizes (PUT /api/products path).

**STEP 3 — cost_price at time of sale**
- Migration `20260305130000_sale_lines_cost_price_at_sale.sql`: add `sale_lines.cost_price`; backfill from `warehouse_products`.
- Migration `20260305140000_record_sale_populate_cost_price.sql`: `record_sale` sets `sale_lines.cost_price` from `warehouse_products.cost_price` on insert.
- GET `/api/sales`: include `cost_price` in line items (as `costPrice`).

## Migrations to run (in order)

Run in **Supabase SQL Editor** or via your migration runner:

1. `inventory-server/supabase/migrations/20260305120000_upsert_by_size_prevent_vanishing.sql`
2. `inventory-server/supabase/migrations/20260305130000_sale_lines_cost_price_at_sale.sql`
3. `inventory-server/supabase/migrations/20260305140000_record_sale_populate_cost_price.sql`
4. `inventory-server/supabase/migrations/20260305150000_get_sales_report_rpc.sql` — required for GET /api/reports/sales (revenue, COGS, profit in SQL).

**Before running:** If your `sales` table does not have delivery columns yet, run `warehouse-pos/supabase/migrations/DELIVERY_MIGRATION.sql` and `ADD_DELIVERY_CANCELLED.sql` first.

**STEP 4 — Reports API (done)**  
- Migration `20260305150000_get_sales_report_rpc.sql`: RPC `get_sales_report(p_warehouse_id, p_from, p_to)` returns revenue, cogs, grossProfit, marginPct, transactionCount, unitsSold, averageOrderValue, topProducts, salesByDay (all from sales + sale_lines in SQL).  
- GET `/api/reports/sales?warehouse_id=&from=&to=` (optional `period=today|week|month|last_month|quarter|year`) calls the RPC and returns JSON.

**STEP 5 — Reports UI (partial)**  
- Reports page now prefers GET /api/reports/sales when user and warehouse are set; falls back to transactions + JS report.  
- Sales metrics show **Cost of Goods** when report is from API; **Gross Profit** and **Profit Margin** (1 decimal); currency via formatCurrency (₵).  
- Loading state and source caption (“Sales from POS (revenue, COGS, profit from sale records)” when API is used).  
- Remaining: period preset tabs, full inventory snapshot section, sales history table with expandable lines, alerts summary (per full spec).

## Remaining (Steps 5–7)

- **STEP 5 (remaining):** Period preset tabs, inventory snapshot cards, sales history table + CSV, alerts.
- **STEP 6:** Cross-cutting verification (delivery → inventory → dashboard → reports; sale → inventory → reports).
- **STEP 7:** Final verification (diagnostic queries, manual flows).

No data has been modified by code; only schema and function changes are in migrations (backfill in 20260305130000 updates existing sale_lines cost_price from current product).
