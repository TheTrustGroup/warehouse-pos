# Verify /api/products/:id after 405 fix — do in this order

**Route change:** Product-by-id is now served by **catch-all** `app/api/products/[...id]/route.ts` (same URL `/api/products/:id`) so Vercel reliably invokes it. The previous `[id]` segment was returning Next.js 404 on Vercel.

## Step 1 — Trigger a new deployment

Already done: empty commit pushed (`chore: trigger redeploy for /api/products/[id]`).  
If you need to trigger again:

```bash
cd warehouse-pos/inventory-server   # or your path to inventory-server
git commit --allow-empty -m "chore: trigger redeploy for /api/products/[id]"
git push
```

---

## Step 2 — Confirm the build includes the route (Vercel dashboard)

1. Open **Vercel** → project **warehouse-pos-api-v2**.
2. Go to **Deployments**. Open the **latest** deployment (top of list).
3. Check **Source**: commit should be **`85bc2fa`** or later (catch-all route).
4. Open the **Build** step (click the deployment, then the build log).
5. In the build output, find the **Route (app)** table. You must see:
   - `ƒ /api/products/[...id]`
   If it is missing, the route was not built.
6. **If the route is missing or deployment is old:**  
   **Redeploy with cache clear:**  
   **Deployments** → **⋯** (three dots) on latest → **Redeploy** → enable **“Clear build cache and redeploy”** → **Redeploy**.  
   Wait until the new deployment finishes.

---

## Step 3 — Re-test (after new deployment is ready)

Run (no auth; expect **401**):

```bash
curl -s -o /dev/null -w "%{http_code}" https://warehouse-pos-api-v2.vercel.app/api/products/test-id
```

- **401** → Route is live; 405 fix verified.
- **404** → Route not in this deployment: repeat Step 2 with “Clear build cache and redeploy”, then Step 3 again.
- **405** → Route is hit but PUT not exported; check `app/api/products/[...id]/route.ts` and redeploy.

---

## Step 4 — (Optional) Test PUT with auth

Use a real product id, warehouse id, and token (e.g. from frontend `localStorage.getItem('auth_token')`):

```bash
TOKEN="<your-token>"
API="https://warehouse-pos-api-v2.vercel.app"
PRODUCT_ID="<real-product-uuid>"
WAREHOUSE_ID="<real-warehouse-uuid>"

curl -s -w "\n%{http_code}" -X PUT "$API/api/products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"warehouseId\":\"$WAREHOUSE_ID\",\"name\":\"Test\",\"category\":\"Sneakers\",\"sellingPrice\":450,\"sizeKind\":\"sized\",\"quantityBySize\":[{\"sizeCode\":\"EU25\",\"quantity\":4}]}"
```

Expected: **200** and JSON body of the updated product.

---

## Next orders (if Step 3 still returns 404)

1. **Confirm project config**
   - **Vercel** → **warehouse-pos-api-v2** → **Settings** → **General**.
   - **Root Directory** must be exactly **`inventory-server`** (no leading slash, no `warehouse-pos/`).
   - **Include files outside the root** = **Off**.
   - Save if changed, then **Redeploy** (with “Clear build cache and redeploy”).

2. **Confirm which deployment is live**
   - **Deployments** → note the **production** deployment (green check, “Production”).
   - Open it and check **Source** = commit **85bc2fa** (or later).
   - If production points to an older deployment, **Promote to Production** the latest one, or trigger a new deploy from **main**.

3. **Check the “1” warning**
   - In the deployment, open **Logs** or **Find in logs** and read the warning.
   - It may explain why the function is not invoked (e.g. timeout, memory, or routing).
   - **Diagnostic:** In Logs, filter or search by **Request Path**. You will see `/api/products`, `/api/health`, `/api/orders`, etc., but **no** `/api/products/test-id` or `/api/products/<any-id>`. That confirms requests to `/api/products/:id` never reach the serverless function (they get the app’s HTML 404 before the function runs).

4. **If 404 persists**
   - **Fallback implemented:** Get/put/delete by id are now also served on the **same** route `/api/products` (no path segment), so they work on Vercel.
   - **GET one:** `GET /api/products?id=xxx&warehouse_id=yyy` (auth required → 401 without token).
   - **PUT/PATCH:** `PUT /api/products` or `PATCH /api/products` with body `{ id, warehouseId, ... }`.
   - **DELETE:** `DELETE /api/products?id=xxx&warehouse_id=yyy` (or id + warehouseId in body).
   - Frontend was updated to use these (InventoryContext productByIdPath → query; PUT uses path `/api/products` with id in body; InventoryPage PUT/DELETE updated). After deploy, verify:
     - `curl -s -o /dev/null -w "%{http_code}" "https://warehouse-pos-api-v2.vercel.app/api/products?id=test-id"` → **401**.
