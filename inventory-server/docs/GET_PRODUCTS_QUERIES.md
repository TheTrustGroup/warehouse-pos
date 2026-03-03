# GET /api/products — Full Query Reference

The API uses the **Supabase JavaScript client** (`@supabase/supabase-js`), not raw SQL or Prisma/Drizzle. There is **no single SQL query**: the handler runs **three separate queries** (products, inventory, inventory-by-size), then merges and aggregates in JavaScript.

**Source:** `lib/data/warehouseProducts.ts` → `getWarehouseProducts()` (list) and `getProductById()` (single).

---

## 1. List products (GET /api/products, no `?id=`)

### Query order and equivalent SQL

#### Step A — Products list (one query)

**Supabase call:**
```ts
db.from('warehouse_products')
  .select('id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, color, version, created_at, updated_at', { count: 'exact' })
  .order('name')
  .range(offset, offset + limit - 1)
// If table has warehouse_id and effectiveWarehouseId is set:
  .eq('warehouse_id', effectiveWarehouseId)
// If options.q:
  .or('name.ilike.%search%,sku.ilike.%search%')
// If options.category:
  .eq('category', options.category)
```

**Equivalent SQL:**
```sql
SELECT id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, color, version, created_at, updated_at
FROM warehouse_products
WHERE warehouse_id = $1   -- only if column exists and effectiveWarehouseId set
  AND (name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')  -- only if q
  AND category = $3       -- only if category
ORDER BY name
LIMIT $4 OFFSET $5;

-- Plus a separate count query by PostgREST when count: 'exact'.
```

Result: `rows` (product list), `productIds = rows.map(r => r.id)`.

---

#### Step B — Inventory totals and by-size (two queries in parallel)

**Query B1 — `warehouse_inventory` (no JOIN):**
```ts
db.from('warehouse_inventory')
  .select('product_id, quantity')
  .eq('warehouse_id', effectiveWarehouseId)
  .in('product_id', productIds)
```

**Equivalent SQL:**
```sql
SELECT product_id, quantity
FROM warehouse_inventory
WHERE warehouse_id = $1
  AND product_id = ANY($2::uuid[]);
```

---

**Query B2 — `warehouse_inventory_by_size` (with optional LEFT JOIN to `size_codes`):**

**Supabase call (primary):**
```ts
db.from('warehouse_inventory_by_size')
  .select('product_id, size_code, quantity, size_codes!left(size_label)')
  .eq('warehouse_id', effectiveWarehouseId)
  .in('product_id', productIds)
```

**Equivalent SQL (PostgREST embeds the relation):**
```sql
SELECT
  wibs.product_id,
  wibs.size_code,
  wibs.quantity,
  sc.size_label   -- from LEFT JOIN
FROM warehouse_inventory_by_size wibs
LEFT JOIN size_codes sc ON sc.size_code = wibs.size_code  -- FK: wibs.size_code -> size_codes.size_code
WHERE wibs.warehouse_id = $1
  AND wibs.product_id = ANY($2::uuid[]);
```

**Fallback (if the first call errors with relation/size_codes):**
```ts
db.from('warehouse_inventory_by_size')
  .select('product_id, size_code, quantity')
  .eq('warehouse_id', effectiveWarehouseId)
  .in('product_id', productIds)
```

**Equivalent SQL (no JOIN):**
```sql
SELECT product_id, size_code, quantity
FROM warehouse_inventory_by_size
WHERE warehouse_id = $1
  AND product_id = ANY($2::uuid[]);
```

No subqueries or aggregations in SQL for this table; all grouping/aggregation is in JavaScript (see Step C).

---

#### Step C — Aggregation (in JavaScript, not SQL)

- **invMap:** `product_id → total quantity` from `warehouse_inventory`.
- **sizeMap:** `product_id → [{ sizeCode, sizeLabel, quantity }, ...]` from `warehouse_inventory_by_size`, sorted by `sizeCode`.
- For each product row:
  - If `size_kind === 'sized'` and there are size rows: `quantity = sum(size.quantity)`.
  - Else: `quantity = invMap[product_id] ?? 0`.
- Filtering for `low_stock` / `out_of_stock` is applied in JS after this.

So: **every JOIN and every aggregation involving `warehouse_inventory_by_size`** is either:
- the single **LEFT JOIN** to `size_codes` in the by-size query above, or
- the **in-memory** merge/aggregation in `warehouseProducts.ts` (no extra SQL).

---

## 2. Single product (GET /api/products?id=...)

**Source:** `getProductById(warehouseId, productId)`.

#### Query 1 — Product row
```sql
SELECT id, sku, barcode, name, description, category, size_kind, selling_price, cost_price, reorder_level, location, supplier, tags, images, color, version, created_at, updated_at
FROM warehouse_products
WHERE id = $1
LIMIT 1;
```

#### Query 2 — Inventory total
```sql
SELECT quantity
FROM warehouse_inventory
WHERE warehouse_id = $1 AND product_id = $2
LIMIT 1;
```

#### Query 3 — Inventory by size (with LEFT JOIN to size_codes)
```sql
SELECT wibs.size_code, wibs.quantity, sc.size_label
FROM warehouse_inventory_by_size wibs
LEFT JOIN size_codes sc ON sc.size_code = wibs.size_code
WHERE wibs.warehouse_id = $1 AND wibs.product_id = $2;
```

Quantity is then: if sized and size rows exist, `sum(size.quantity)`; else `warehouse_inventory.quantity`.

---

## Summary table

| Step | Table(s) | JOINs | Aggregation |
|------|----------|--------|-------------|
| A | warehouse_products | none | none |
| B1 | warehouse_inventory | none | none |
| B2 | warehouse_inventory_by_size | **LEFT JOIN size_codes** on `size_code` | none (in JS) |
| C | — | — | **In JS:** quantity from B1 or sum of B2 rows; quantityBySize from B2 |

There are **no SQL subqueries** and **no GROUP BY** in the backend; the only JOIN touching `warehouse_inventory_by_size` is the optional **LEFT JOIN** to `size_codes` for `size_label`.

---

## Performance checks

### GROUP BY / SUM on warehouse_inventory_by_size?

**No.** All aggregation is in JavaScript:
- `warehouse_inventory_by_size` is queried with `WHERE warehouse_id = $1 AND product_id = ANY($2)` — no GROUP BY or SUM in SQL.
- Total quantity for sized products is computed in JS: `sizes.reduce((s, r) => s + r.quantity, 0)`.

So no index is required for SQL aggregation; indexes on `(warehouse_id, product_id)` are for the WHERE clause (see below).

### N+1 pattern?

**No.**  
- **List path:** 1 query for products → collect `productIds` → 2 queries in parallel (`Promise.all`) for `warehouse_inventory` and `warehouse_inventory_by_size` with `.in('product_id', productIds)`. Total **3 queries** per request, independent of page size.  
- **Single-product path:** 3 queries for that one product (product, inventory, by-size), not in a loop.

### Indexes

The migration `20260302153000_products_list_perf_indexes.sql` already adds the required indexes (same column lists, different names):

| Purpose | Existing index | Columns |
|--------|----------------------------------|------------------------------------------|
| warehouse_inventory filter | idx_warehouse_inventory_warehouse_id_product_id | (warehouse_id, product_id) |
| warehouse_inventory_by_size filter | idx_wibs_warehouse_id_product_id | (warehouse_id, product_id) |
| warehouse_products warehouse filter | idx_warehouse_products_warehouse_id | (warehouse_id) — created only if column exists |

No additional indexes are needed for the current query pattern.
