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
3. Check **Source**: commit should be `5389124` or later (e.g. `376152e` or `5389124`).
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
- **405** → Route is hit but PUT not exported; check `app/api/products/[id]/route.ts` and redeploy.

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
