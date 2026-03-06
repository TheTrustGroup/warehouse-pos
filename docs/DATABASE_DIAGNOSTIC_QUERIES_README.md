# Database diagnostic queries — where to run them

Run the **14 diagnostic queries** in Supabase SQL Editor for **both** projects (EDK and Hunnid).

## Run in both projects (checklist)

| Step | EDK | Hunnid |
|------|-----|--------|
| Open Supabase → SQL Editor | ☐ | ☐ |
| Run full `DATABASE_DIAGNOSTIC_QUERIES.sql` (or each block) | ☐ | ☐ |
| Queries 1, 4, 5, 6, 7, 8, 10: 0 rows? | ☐ | ☐ |
| If any non-zero: apply [remediation](#remediation-when-0-rows-expected) below | ☐ | ☐ |

## Query file (in order)

All 14 queries in execution order are in:

- **`docs/DATABASE_DIAGNOSTIC_QUERIES.sql`** (this repo)

Copy each section into the SQL Editor and run it, or run the whole file if your editor supports it.

## Links to Supabase SQL Editor

Open the SQL Editor for your project, then paste/run the queries from the file above.

| # | Project | SQL Editor (replace `YOUR_PROJECT_REF` with your Supabase project reference) |
|---|---------|-------------------------------------------------------------------------------|
| 1 | **EDK** (Extreme Dept Kidz) | `https://supabase.com/dashboard/project/YOUR_EDK_PROJECT_REF/sql/new` |
| 2 | **Hunnid** | `https://supabase.com/dashboard/project/YOUR_HUNNID_PROJECT_REF/sql/new` |

To find your project ref: Supabase Dashboard → your project → **Settings** → **General** → **Reference ID**.

## Quick link (if you have one project open)

- **New query:** Supabase Dashboard → **SQL Editor** → **New query**

## The 14 queries (in order)

| # | Purpose | Healthy result |
|---|---------|----------------|
| 1 | Tables without primary keys | 0 rows |
| 2 | Foreign keys without indexes | Add indexes for any rows returned |
| 3 | Nullable columns (review) | Review list; add NOT NULL where needed |
| 4 | Orphaned inventory records | Count = 0 |
| 5 | Negative stock | 0 rows |
| 6 | Stock drift (total ≠ sum of sizes) | 0 rows |
| 7 | Sales with no line items | 0 rows |
| 8 | Sale lines with no parent sale | 0 rows |
| 9 | Products with no inventory | Review (may be valid) |
| 10 | Duplicate SKUs (global) | 0 rows |
| 11 | RLS policies | Review |
| 12 | RLS enabled per table | Review |
| 13 | record_sale function signature | Single expected overload |
| 14 | Check constraints | Review |
| **14b** | Check constraints (warehouse/POS tables only) | Optional; shorter list for review |

Fix any query that returns non-zero rows where zero is expected (1, 4, 5, 6, 7, 8, 10). See [Remediation](#remediation-when-0-rows-expected) below.

---

## Remediation (when 0 rows expected)

When a query that should return **0 rows** returns rows, fix as follows.

| Query | If you get rows… | What to do |
|-------|-------------------|------------|
| **1** Tables without primary keys | One or more table names | Add a primary key to each table (migration: `ALTER TABLE … ADD PRIMARY KEY …`). Prefer a single column (e.g. `id uuid`) or a composite that is unique and not null. |
| **4** Orphaned inventory | Count &gt; 0 | Rows in `warehouse_inventory` or `warehouse_inventory_by_size` reference a `product_id` that no longer exists in `warehouse_products`. Delete the orphaned inventory rows, or restore the missing product. |
| **5** Negative stock | Rows with product_id, warehouse_id, quantity &lt; 0 | Fix data: either correct the quantity (e.g. set to 0 or the true count) or run the restore-stock migration/script if this came from a void/refund. Do not leave negative quantities. |
| **6** Stock drift | Rows where stored ≠ sum of sizes | Sync `warehouse_inventory.quantity` with the sum of `warehouse_inventory_by_size.quantity` for that (warehouse_id, product_id). Run an UPDATE that sets `quantity` from a subquery: `SELECT warehouse_id, product_id, COALESCE(SUM(quantity),0) FROM warehouse_inventory_by_size GROUP BY warehouse_id, product_id`, then join to `warehouse_inventory` and update where they differ. |
| **7** Sales with no line items | Sale ids with no rows in `sale_lines` | Data bug: either add the missing line items, or void/delete the sale if it was created in error. |
| **8** Sale lines with no parent sale | Line items whose `sale_id` is missing in `sales` | Delete the orphaned `sale_lines` rows or restore the parent `sales` row. |
| **9** Products with no inventory | Product ids with no row in `warehouse_inventory` | Often valid (new products). If they should have stock, add rows to `warehouse_inventory` (and optionally `warehouse_inventory_by_size`) for the correct warehouse. |
| **10** Duplicate SKUs | Same `sku` on multiple rows in `warehouse_products` | Enforce unique SKU: rename or merge duplicates so each SKU appears once. Consider adding a unique constraint on `sku` after cleaning. |

For **2** (FKs without indexes): add an index on the reported (table_name, column_name), e.g. `CREATE INDEX idx_tablename_columnname ON tablename(column_name);`.

See **docs/OPTIONAL_FOLLOWUPS.md** for backend deploy and full checklist.
