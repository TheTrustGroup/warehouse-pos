# Phase 1 — Forensic Audit: Dashboard "Out of Stock" vs Actual Stock

**Scope:** Warehouse Inventory & POS at warehouse.extremedeptkidz.com  
**Symptom:** Dashboard shows products as "Out of Stock" when they have stock (e.g. Amiri with EU30-4, EU31-1 shows "In stock" on card but "Out of stock" in Stock Alerts).  
**Instruction:** Findings only; no fix code until plan is approved.

---

## 1. HOW IS "OUT OF STOCK" DETERMINED?

### 1.1 Database RPC: `get_warehouse_inventory_stats`

| Location | Condition | Source | What is checked | Can sized product with all sizes > 0 show out of stock? |
|----------|-----------|--------|-----------------|---------------------------------------------------------|
| `inventory-server/supabase/migrations/20260304120000_warehouse_inventory_stats_rpc.sql` lines 39–45, 55 | `qty = 0` for out_of_stock_count | Live query | **qty** = CASE WHEN `wp.size_kind = 'sized'` AND `bs.qty IS NOT NULL` THEN `bs.qty` (sum from `warehouse_inventory_by_size`) ELSE `inv.quantity` (from `warehouse_inventory`) | **Yes.** If `warehouse_products.size_kind` is not `'sized'` (e.g. `'na'`), the RPC uses `inv.quantity`. If that row is 0 or missing, qty = 0 even when `warehouse_inventory_by_size` has positive quantities. |

- **Exact condition:** `COUNT(*) FILTER (WHERE qty = 0)::bigint` (line 55).  
- **qty** is computed in CTE `with_qty` (lines 34–49): `COALESCE(CASE WHEN wp.size_kind = 'sized' AND bs.qty IS NOT NULL THEN bs.qty ELSE inv.quantity END, 0)`.

### 1.2 Backend product list (dashboard + inventory API)

| Location | Condition | Source | What is checked | Same risk? |
|----------|-----------|--------|-----------------|------------|
| `inventory-server/lib/data/warehouseProducts.ts` lines 275–278 | `quantity` used for filtering and response | Live DB: `invMap` (warehouse_inventory) and `sizeMap` (warehouse_inventory_by_size) | `isSized = (row.size_kind === 'sized') && sizes.length > 0`; then `quantity = isSized ? sum(sizes) : invMap[id] ?? 0` | **Yes.** If `size_kind !== 'sized'`, API returns `quantity = invMap` (often 0) and still returns `quantityBySize` from size rows. So API can return `quantity: 0` and `quantityBySize: [{ EU30, 4 }, { EU31, 1 }]`. |

### 1.3 Backend dashboard stats (fallback when RPC fails)

| Location | Condition | Source | What is checked | Same risk? |
|----------|-----------|--------|-----------------|------------|
| `inventory-server/lib/data/dashboardStats.ts` lines 14–19, 165–166 | `getProductQty(p)` then `qty === 0` for out count | Product list (capped 250) from `getWarehouseProducts` | Same as 1.2: uses `p.quantityBySize` only when `p.sizeKind === 'sized'`; else `p.quantity` | **Yes.** If product has `sizeKind !== 'sized'` and `quantity === 0` but `quantityBySize` with values, it is counted as out of stock. |

### 1.4 Frontend — ProductCard (Inventory page)

| Location | Condition | Source | What is checked | Same risk? |
|----------|-----------|--------|-----------------|------------|
| `src/components/inventory/ProductCard.tsx` lines 37–49 | `getTotalQuantity(product)` then `qty === 0` → 'out'; `qty <= reorderLevel` or `qty <= 3` → 'low' | Product from context (API + cache merge) | Uses `quantityBySize` **only when** `product.sizeKind === 'sized' && quantityBySize?.length > 0`; else `product.quantity` | **Yes.** If API sends `sizeKind: 'na'` and `quantity: 0` but `quantityBySize: [4,1]`, card would show Out of stock. **Unless** cache merge (InventoryContext) overwrites with `sizeKind: 'sized'` from cache — then card shows In stock while dashboard (fresh API, no cache) shows Out of stock. |

### 1.5 Frontend — POSProductCard (POS page)

| Location | Condition | Source | What is checked | Same risk? |
|----------|-----------|--------|-----------------|------------|
| `src/components/pos/POSProductCard.tsx` lines 25–29, 77–88 | `getStockStatus(product)` uses **only** `product.quantity`; display uses sum of `quantityBySize` for sized | Product from POS list | **Status:** `product.quantity === 0` → 'out'; `product.quantity <= 3` → 'low'. **Display qty:** sized ? sum(quantityBySize) : quantity | **Bug.** For sized products, status is based on `product.quantity` (can be 0 from API) while displayed qty is sum of sizes. So a product can show "Out of stock" and be disabled even when sum(quantityBySize) > 0. |

---

## 2. WHERE DOES THE DASHBOARD "OUT OF STOCK" COUNT COME FROM?

- **Source:** `GET /api/dashboard?warehouse_id=...` → `inventory-server/app/api/dashboard/route.ts` (line 65) → `getDashboardStats(warehouseId, { date })` → `inventory-server/lib/data/dashboardStats.ts`.
- **Count:** When RPC is available: `getWarehouseStatsFromRpc(warehouseId)` (lines 58–76) → Supabase `rpc('get_warehouse_inventory_stats', { p_warehouse_id })` → `out_of_stock_count` from the RPC (line 73). So it is a **database COUNT** (live), not a JS filter.
- **When RPC fails:** Fallback (lines 156–168) computes from the first 250 products: loop with `getProductQty(p)`, `if (qty === 0) out++`. So it is a **JS filter on a capped product list**, using the same `getProductQty` that depends on `sizeKind === 'sized'` and `quantityBySize`.
- **Code path:** DashboardPage.tsx line 273: `{stats.outOfStockCount} out of stock` ← `stats` from `useDashboardQuery` → API response `outOfStockCount` ← server `getDashboardStats` ← RPC `out_of_stock_count` (or fallback).

---

## 3. THE total_quantity FIELD — IS IT ACCURATE?

- **Schema:** There is **no** `total_quantity` (or `quantity`) column on `warehouse_products` in this codebase. The select list is in `warehouseProducts.ts` line 88: `id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, color, version, created_at, updated_at`.
- **Where quantity lives:**  
  - `warehouse_inventory`: one row per (product_id, warehouse_id) with `quantity`.  
  - `warehouse_inventory_by_size`: one row per (product_id, warehouse_id, size_code) with `quantity`.
- **Relevant drift:** For **sized** products, the single row in `warehouse_inventory` can be out of sync with `SUM(warehouse_inventory_by_size.quantity)`. `record_sale` (see below) keeps them in sync for sales; manual edits go through `updateWarehouseProduct`, which writes both.

**Diagnostic query (adjusted to actual schema — no total_quantity on warehouse_products):**

Drift = `warehouse_inventory.quantity` vs sum of sizes for the same product/warehouse. Products that are sized (have rows in `warehouse_inventory_by_size`) should have `warehouse_inventory.quantity = SUM(by_size.quantity)`.

```sql
-- Drift: warehouse_inventory.quantity vs SUM(warehouse_inventory_by_size.quantity) per product/warehouse
SELECT
  wi.warehouse_id,
  wi.product_id,
  wp.name,
  wi.quantity AS stored_inv_quantity,
  COALESCE(bs.real_total, 0) AS real_total_from_sizes,
  wi.quantity - COALESCE(bs.real_total, 0) AS drift
FROM warehouse_inventory wi
JOIN warehouse_products wp ON wp.id = wi.product_id
LEFT JOIN (
  SELECT warehouse_id, product_id, SUM(quantity) AS real_total
  FROM warehouse_inventory_by_size
  GROUP BY warehouse_id, product_id
) bs ON bs.warehouse_id = wi.warehouse_id AND bs.product_id = wi.product_id
WHERE wp.size_kind = 'sized'
  AND (bs.real_total IS NOT NULL AND bs.real_total > 0)
  AND wi.quantity != COALESCE(bs.real_total, 0)
ORDER BY drift DESC;
```

If this returns rows, those product/warehouse rows have wrong `warehouse_inventory.quantity` and can be counted as out of stock when the RPC uses `inv.quantity` (e.g. when `size_kind` is wrong or RPC logic uses inv for that product).

---

## 4. THE stock_status FIELD — IS IT STALE?

- **There is no `stock_status` (or similar) column** on `warehouse_products`, `warehouse_inventory`, or `warehouse_inventory_by_size` in the migrations or select lists used in the codebase.
- **Conclusion:** Stock status is **always computed** from quantity (and reorder_level). The bug is not a stale stored status but **which quantity** is used (inv vs sum of sizes) and **size_kind** driving that choice.

---

## 5. THE ALERTS COUNT — "OUT OF STOCK" AND "LOW STOCK"

- **Out of stock:** RPC: `COUNT(*) FILTER (WHERE qty = 0)`. Not `stock_status`; no such column.
- **Low stock:** RPC: `COUNT(*) FILTER (WHERE qty > 0 AND qty <= reorder_level)` (line 54). So **low stock = per-product reorder_level** from `warehouse_products.reorder_level`, not a single global constant.
- **Threshold:** "Low stock" is **not** a single constant in the RPC; it is `reorder_level` per product. In the frontend, ProductCard uses `product.reorderLevel ?? 3` and also `qty <= 3` as a second low-stock rule (ProductCard.tsx lines 47–48). So **3** appears as a fallback when reorder_level is missing; the RPC uses only `reorder_level` (COALESCE 0).

---

## 6. WHAT UPDATES STOCK AFTER EACH ACTION?

| Action | warehouse_inventory_by_size | warehouse_inventory (total) | total_quantity on product | stock_status |
|--------|----------------------------|-----------------------------|---------------------------|--------------|
| **(a) Sale (POS)** | Yes — deduct in `record_sale` (lines 96–98). | Yes — for sized, recompute from SUM(by_size) (lines 99–103); for non-sized, deduct (116–117). | N/A (no column) | N/A |
| **(b) Manual edit (Inventory)** | Yes — `updateWarehouseProduct` replaces by_size rows (lines 586–601) and sets `warehouse_inventory.quantity = totalQty` (lines 575–581). | Yes. | N/A | N/A |
| **(c) Delivery** | Not traced in this audit; no deliveries module that updates stock in the same code paths. | — | — | — |
| **(d) Add product with initial stock** | Yes — `createWarehouseProduct` inserts into both (lines 453–478). | Yes (lines 453–456). | N/A | N/A |

No path updates a stored `stock_status` or product-level `total_quantity`; they do not exist.

---

## 7. THE record_sale RPC — WHAT DOES IT UPDATE?

**File:** `inventory-server/supabase/migrations/20260304100000_sales_payments_breakdown.sql` (lines 19–139).

- **Sized product:** Reads `size_kind` from `warehouse_products` (line 79). Deducts from `warehouse_inventory_by_size` (96–98). Then updates `warehouse_inventory`: `quantity = (SELECT COALESCE(SUM(quantity), 0) FROM warehouse_inventory_by_size WHERE ...)` (99–103). So **total in warehouse_inventory is kept in sync** after each sale for that product/warehouse.
- **Non-sized:** Deducts from `warehouse_inventory` only (115–117).
- **Does not:** Update any column on `warehouse_products` (no total_quantity or stock_status). So **record_sale does not create product-level drift**; the only drift possible is if `size_kind` is wrong and the RPC/product list use `warehouse_inventory.quantity` instead of sum of sizes.

---

## 8. FRONTEND DISPLAY LOGIC

- **ProductCard** (Inventory): Uses `getTotalQuantity` (sum of quantityBySize when sized, else product.quantity) then `getStockStatus` (qty === 0 → out; qty <= reorderLevel or qty <= 3 → low). So it **derives** status from quantity at render, but the **quantity** used depends on `sizeKind` and `quantityBySize`. If API sends wrong or inconsistent `sizeKind`, card and dashboard can disagree.
- **POSProductCard:** Uses **only** `product.quantity` for `getStockStatus` (lines 25–29), but uses sum of `quantityBySize` for **display** qty (lines 86–88). So it **can** show "Out of stock" and disabled while displaying a positive "X in stock" when the API sends quantity 0 and quantityBySize with positive sum (e.g. when sizeKind is wrong or quantity not derived from sizes).

---

## 9. THE DASHBOARD STATS ENDPOINT

- **Endpoint:** `GET /api/dashboard` — `inventory-server/app/api/dashboard/route.ts` → `getDashboardStats(warehouseId, { date })`.
- **Out-of-stock count:** From RPC `get_warehouse_inventory_stats` (live), not cached. Query is the SQL in section 1.1; it uses **actual quantity** (inv or by_size sum) driven by **size_kind**.
- **Could it be stale?** Only if the RPC or DB is serving a stale snapshot; the code path does not use a materialized view or app-level cache for the count. The **list** of low-stock items is from a **capped** `getWarehouseProducts(warehouseId, { limit: 250 })`, so the **list** is a sample; the **count** is over all products in the RPC.

---

# Phase 2 — ROOT CAUSE ANALYSIS

**"Products show as out of stock when they have stock because…"**

1. **Primary cause — RPC and product list rely on `warehouse_products.size_kind` to choose quantity source.**  
   - **Location:** RPC: `20260304120000_warehouse_inventory_stats_rpc.sql` lines 40–44. Product list: `warehouseProducts.ts` lines 275–278.  
   - **What is wrong:** When `size_kind` is not `'sized'` (e.g. `'na'` or `'one_size'`), the RPC uses `inv.quantity` and the API uses `invMap[id]`. For products that **do** have rows in `warehouse_inventory_by_size`, that can be 0 (or stale), so they are counted and shown as out of stock even though sum of sizes > 0.  
   - **Proof:** Run the diagnostic in section 3; also run:  
     `SELECT id, name, size_kind, (SELECT SUM(quantity) FROM warehouse_inventory_by_size wis WHERE wis.product_id = wp.id AND wis.warehouse_id = :wh) AS by_size_sum FROM warehouse_products wp WHERE size_kind != 'sized' AND EXISTS (SELECT 1 FROM warehouse_inventory_by_size wis WHERE wis.product_id = wp.id AND wis.warehouse_id = :wh);`  
     Any rows returned are products with size-level stock but non-sized size_kind — they can appear out of stock.  
   - **Fix required:** Derive quantity from actual data: use `COALESCE(by_size.qty, inv.quantity)` (or equivalent) so that if **any** size-level quantity exists, that sum is used, regardless of `size_kind`. Same in product list and frontend: derive "total quantity" from size sum when size rows exist, and use that for status everywhere.

2. **Secondary cause — POSProductCard uses `product.quantity` for status but sum of sizes for display.**  
   - **Location:** `src/components/pos/POSProductCard.tsx` lines 25–29 (getStockStatus) vs 86–88 (qty for label).  
   - **What is wrong:** For sized products, status is based on `product.quantity` (may be 0 from API) while the label shows sum(quantityBySize). So the card can show "Out of stock" and be disabled even when the displayed quantity is positive.  
   - **Fix required:** Compute a single derived quantity (sum of quantityBySize when sized, else quantity) and use it for **both** status and display.

3. **Tertiary — Cache merge on Inventory can show "In stock" while dashboard shows "Out of stock".**  
   - **Location:** `src/contexts/InventoryContext.tsx` (e.g. lines 470–472, 482–488): cache merge can keep `sizeKind: 'sized'` and `quantityBySize` from cache when API returns empty/synthetic sizes.  
   - **What is wrong:** Inventory page can display a product as "In stock" (from merged/cached sizeKind + quantityBySize) while the dashboard request (no cache) gets the same product with `sizeKind: 'na'` and `quantity: 0`, so it appears in Stock Alerts as out of stock.  
   - **Fix required:** Once quantity is derived consistently from actual quantities (and optionally size_kind corrected in DB or RPC), both dashboard and Inventory will agree. Optionally, ensure dashboard and list never rely on stored `size_kind` for "do we use size sum?" — use "has size rows" instead.

---

**Confidence:** **~85%** that the above explains the observed out-of-stock inflation. Remaining uncertainty: (1) we have not run the diagnostic query on the live DB to confirm drift or wrong size_kind rows; (2) warehouse_id could differ between Dashboard and Inventory in some sessions (e.g. sentinel vs real), which would also cause apparent mismatch.

---

**Next step:** Await your approval before Phase 3 (fixes). No code changes have been made.
