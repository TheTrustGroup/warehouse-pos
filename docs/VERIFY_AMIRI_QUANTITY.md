# Verify Amiri (SKU-MLSJD25H-52H3H) shows correct quantity

When the database has **Amiri (white/Black)** with **EU40 quantity 8** for warehouse `00000000-0000-0000-0000-000000000001` but both devices show **0**, use this to find where the chain breaks.

## 1. Confirm the row in the database

Run in **Supabase SQL Editor** (or your DB client):

```sql
-- Product id for Amiri (from warehouse_products by SKU)
-- Replace with your product id if different
SELECT id, sku, name FROM warehouse_products WHERE sku = 'SKU-MLSJD25H-52H3H';

-- Expected: one row, e.g. id = e72712ee-a38a-4540-afc3-8bcbb4b76a5d

-- Size row for Main Store warehouse
SELECT wis.warehouse_id, wis.product_id, wis.size_code, wis.quantity
FROM warehouse_inventory_by_size wis
JOIN warehouse_products wp ON wp.id = wis.product_id
WHERE wp.sku = 'SKU-MLSJD25H-52H3H'
  AND wis.warehouse_id = '00000000-0000-0000-0000-000000000001';
```

- If this returns **no rows**: the data is missing or under a different `warehouse_id`. Insert or fix the row for warehouse `00000000-0000-0000-0000-000000000001`.
- If this returns **one row** with `quantity = 8` and `size_code = 'EU40'`: the DB is correct; the issue is either the **request warehouse** or **user scope**.

## 2. Confirm what the API receives and uses

**Which request to inspect:** The Amiri quantity comes from the **product list API**, not the page HTML or the dashboard.

- **Do not use:** The request named **"inventory"** (path `/inventory`) — that is the HTML document for the page.
- **Do not use:** Requests to **`/api/dashboard`** or **`/api/dashboard/today-by-warehouse`** — those are for dashboard stats; they can show "No response headers" if that endpoint is failing, but they do not supply the product list.
- **Use:** A request whose URL contains **`/api/products`** and **`warehouse_id=`** (e.g. `GET .../api/products?warehouse_id=00000000-0000-0000-0000-000000000001&limit=250&offset=0`). In the Network list it may appear as **"products"** or the query string. Use the filter box and type `products` or `warehouse_id` to narrow the list.

Steps:

1. Open **DevTools → Network** on a device where Amiri shows 0.
2. (Optional) In the filter box, type **products** or **warehouse_id** so only relevant requests show.
3. Reload the Inventory page (or switch warehouse to trigger a load).
4. Click the request that goes to **/api/products** with **warehouse_id** in the URL (not `/inventory`, not `/api/dashboard`).
5. Check:
   - **Request URL**  
     `warehouse_id` must be `00000000-0000-0000-0000-000000000001` (Main Store).  
     If you see `00000000-0000-0000-0000-000000000099` (or anything else), the frontend is sending the wrong warehouse and the API will return no size rows for Main Store, so quantity will show as 0.
   - **Response body**  
     If the **Preview** tab says "failed to load resources", the payload is often too large for the devtools preview. Use the **Response** (or **Response** raw) tab instead, or right‑click the request → "Copy response". Then check: `data` array length, `total`, and search for `"e72712ee-a38a-4540-afc3-8bcbb4b76a5d"` or `"Amiri"` to see if Amiri is in the list and what his `quantityBySize` is.
   - **Response headers**  
     After deploying the change that adds the header, the response should include:
     - `X-Data-Warehouse-Id: 00000000-0000-0000-0000-000000000001`  
     If this header is different from the warehouse you expect, the server used that other warehouse for the list (e.g. scope or fallback).
   - **Multiple pages**  
     If `total` is greater than 250, the app requests more pages (e.g. `offset=250`). Amiri might be in a later page; check those requests too.

## 3. If the request already uses the correct warehouse_id

- **User scope**: For non-admin users, the list API only uses `warehouse_id` if it’s in the user’s scope (`user_scopes` or `ALLOWED_WAREHOUSE_IDS`). If `00000000-0000-0000-0000-000000000001` is not in scope, the API may return 400 or use a different warehouse. Ensure the logged-in user has that warehouse in scope.
- **Admin with no scope**: The API uses the `warehouse_id` from the query as-is. So the only way to get wrong data is the frontend sending the wrong `warehouse_id` (see step 2).

## 4. Single-product check (by id)

To see what the API returns for Amiri alone (by product id):

```text
GET /api/products?warehouse_id=00000000-0000-0000-0000-000000000001&id=<AMIRI_PRODUCT_UUID>
```

Replace `<AMIRI_PRODUCT_UUID>` with the `id` from the first SQL query. Check the JSON: `quantity` and `quantityBySize` should show EU40 with 8. Again, ensure the response header `X-Data-Warehouse-Id` is `00000000-0000-0000-0000-000000000001`.

## Summary

| Check | What to verify |
|-------|----------------|
| DB | Row in `warehouse_inventory_by_size` for Amiri + warehouse `...000001` with `quantity = 8`, `size_code = 'EU40'`. |
| Request | List request URL has `warehouse_id=00000000-0000-0000-0000-000000000001`. |
| Response | Header `X-Data-Warehouse-Id` is `00000000-0000-0000-0000-000000000001`. |
| Scope | User has that warehouse in `user_scopes` (or env `ALLOWED_WAREHOUSE_IDS`) if not admin. |

If all three (DB, request, header) match Main Store and the user has scope, the list should show Amiri with EU40 quantity 8. If the request or header shows a different warehouse, fix the warehouse picker or scope so the app requests Main Store (`...000001`).
