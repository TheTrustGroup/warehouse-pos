# Amiri diagnostic – do this in order

In this codebase, **warehouse_products** has **one row per product** (no `warehouse_id` or `total_quantity` on that table). Inventory is in **warehouse_inventory** and **warehouse_inventory_by_size** per warehouse. The list API does **not** use an INNER JOIN on warehouse_inventory; it fetches products, then inventory/sizes, then keeps only products that have at least one inventory or size row for the requested warehouse.

---

## Step 1 – Check all 4 API responses (Network tab)

1. Open DevTools → **Network**. Reload the Inventory page with **Main Store** selected.
2. Filter by **products** (or `api/products`).
3. You should see 4 requests: `offset=0`, `250`, `500`, `750`.
4. For **each** request, click it → open the **Response** tab (raw), then search (Ctrl+F / Cmd+F) for:
   - **Amiri**
   - **e72712ee**
   - **EU40**

Fill this in:

| Request        | offset | Amiri found? (Y/N) | total in JSON | data.length |
|----------------|--------|---------------------|---------------|-------------|
| 1              | 0      |                     |               |             |
| 2              | 250    |                     |               |             |
| 3              | 500    |                     |               |             |
| 4              | 750    |                     |               |             |

- If **Amiri is found** in any response: copy the **full JSON object** for that product (the one with `"id": "e72712ee-a38a-4540-afc3-8bcbb4b76a5d"`) and note what **quantityBySize** and **quantity** are.
- If **Amiri is not in any** of the 4 responses: the API is excluding him; continue to Step 2 and 3.

---

## Step 2 – Run these SQL queries (Supabase SQL editor)

Use these exactly; this project’s **warehouse_products** table has **no** `warehouse_id`, `total_quantity`, `is_active`, or `is_deleted` columns.

```sql
-- 1. Amiri in warehouse_products (one row per product, no warehouse_id)
SELECT id, sku, name, size_kind
FROM warehouse_products
WHERE id = 'e72712ee-a38a-4540-afc3-8bcbb4b76a5d';

-- 2. Size row for Main Store (this is what the API uses for quantity)
SELECT product_id, warehouse_id, size_code, quantity
FROM warehouse_inventory_by_size
WHERE product_id = 'e72712ee-a38a-4540-afc3-8bcbb4b76a5d'
  AND warehouse_id = '00000000-0000-0000-0000-000000000001';

-- 3. Optional warehouse_inventory row (sized products may only have warehouse_inventory_by_size)
SELECT product_id, warehouse_id, quantity
FROM warehouse_inventory
WHERE product_id = 'e72712ee-a38a-4540-afc3-8bcbb4b76a5d'
  AND warehouse_id = '00000000-0000-0000-0000-000000000001';

-- 4. Amiri’s position in the full product list (order by name) – which page he’s on
SELECT position, id, name
FROM (
  SELECT ROW_NUMBER() OVER (ORDER BY name ASC) AS position, id, name
  FROM warehouse_products
) ranked
WHERE id = 'e72712ee-a38a-4540-afc3-8bcbb4b76a5d' OR name ILIKE '%amiri%';

-- 5. Total product count (for pagination)
SELECT COUNT(*) AS total_products FROM warehouse_products;
```

Save the results. In particular:

- Query 1: Amiri must exist.
- Query 2: Must return one row with `size_code = 'EU40'` and `quantity = 8`.
- Query 4: If `position` is e.g. 300, Amiri is on the **second** page (offset 250), so you must check the **offset=250** request in Step 1.

---

## Step 3 – Match your findings to the scenario

### Scenario A – Amiri **not** in any of the 4 API responses

**Possible causes:**

1. **Sizes query failing and fallback not deployed**  
   The list API only includes a product if it has at least one row in `warehouse_inventory` **or** `warehouse_inventory_by_size` for that warehouse. Sizes come from a query that can fail (e.g. `size_codes` join). If it fails and the **fallback** (retry without join) is not in the deployed code, size rows are empty and Amiri is dropped.

   **Fix:** Deploy the change in `inventory-server/lib/data/warehouseProducts.ts` that runs the fallback on **any** sizes query error (not only when the message contains "relation" or "size_codes"). Then re-check the 4 responses.

2. **Amiri on a later page**  
   If Query 4 shows `position` > 250, he’s on a later page. The app requests offset=250, 500, 750. If total is e.g. 1200, ensure you’re checking the response that contains his position (e.g. position 300 → offset=250). If you only have 4 requests, you’re only seeing up to 1000 products; if Amiri is after 1000, he won’t be in any of the 4.

3. **Wrong warehouse_id in DB**  
   If Query 2 returns **no rows**, the size row is missing or under a different `warehouse_id`. Fix data so that `warehouse_inventory_by_size` has a row for `product_id = 'e72712ee-a38a-4540-afc3-8bcbb4b76a5d'` and `warehouse_id = '00000000-0000-0000-0000-000000000001'` with `quantity = 8`.

---

### Scenario B – Amiri **is** in the API response but `quantityBySize` is empty or EU40 has 0

- **Cause:** Sizes query returned no rows for him (e.g. error and fallback not deployed, or wrong warehouse filter).
- **Fix:** Same as Scenario A.1 – deploy the fallback fix and ensure the API uses the same `warehouse_id` as in the request (`00000000-0000-0000-0000-000000000001`). The code already uses the request warehouse; the fallback ensures that when the main sizes query fails, we still load from `warehouse_inventory_by_size`.

---

### Scenario C – Amiri in the API response with correct `quantityBySize` (e.g. EU40: 8) but UI shows 0

- **Cause:** Frontend mapping or cache (e.g. merging/overwriting with stale data).
- **Check:** In the same Network response, confirm the object has `quantityBySize: [{ "sizeCode": "EU40", "quantity": 8 }]` and `quantity: 8`. If the API is correct but the UI is wrong, the bug is in the client (e.g. `normalizeProduct`, merge logic, or offline cache overwriting). Inspect `InventoryContext` merge logic and any IndexedDB/offline layer that might replace `quantityBySize` with empty data.

---

## Step 4 – Report back

Reply with:

1. The filled table from Step 1 (which offsets have Amiri, and for the response where he’s found: `total`, `data.length`, and the full Amiri object including `quantityBySize`).
2. The results of the 5 SQL queries (or paste the result sets).
3. Which scenario (A, B, or C) you’re in.

Then we can give the exact fix (deploy, data fix, or frontend change).
