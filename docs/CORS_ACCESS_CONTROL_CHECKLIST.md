# CORS "access control checks" — products don't load, zeros / out of stock

**Single Vercel project (frontend + API)?** See [VERCEL_SINGLE_PROJECT.md](./VERCEL_SINGLE_PROJECT.md) instead. Same-origin deployment avoids CORS.

---

When the console shows:
**"Fetch API cannot load https://warehouse-pos-api-v2.vercel.app/api/products?... due to access control checks"**

the browser is blocking the response because the **API is not sending CORS headers** that allow your frontend origin. The frontend never gets product data, so you see empty/zero quantity and "Out of stock".

---

## Cause

The **warehouse-pos-api-v2** Vercel project is likely **not** building from this repo’s **inventory-server** folder. The inventory-server in this repo already allows `https://warehouse.extremedeptkidz.com` in `lib/cors.ts`. If the deployed API is from another repo or wrong root, it may not have that CORS config.

---

## Fix (do in order)

### 1. Confirm API project builds from this repo

1. In Vercel, open the **warehouse-pos-api-v2** project.
2. Go to **Settings → Git** (or **General**).
3. Check:
   - **Repository:** Should be the repo that contains **this** `inventory-server` (and its `lib/cors.ts`).
   - **Root Directory:** Must be **`inventory-server`** (the folder that contains `app/api/products/route.ts` and `lib/cors.ts`).  
   If Root Directory is empty or something else (e.g. the repo root), the build may not include the API routes or CORS and CORS will fail.

### 2. Set Root Directory and redeploy

1. Set **Root Directory** to **inventory-server**.
2. Save.
3. **Redeploy:** Deployments → latest → **⋯** → **Redeploy** (or push a commit so a new deployment runs).

### 3. (Optional) Env fallback

In **warehouse-pos-api-v2** → **Settings → Environment Variables**, you can add:

- **Name:** `ALLOWED_ORIGINS`  
- **Value:** `https://warehouse.extremedeptkidz.com`  
- **Environment:** Production (and Preview if you use it)

This only helps if the deployed code reads `ALLOWED_ORIGINS` (this repo’s `lib/cors.ts` does). The main fix is still building from **inventory-server** with the existing CORS code.

### 4. Verify

1. Open the frontend at https://warehouse.extremedeptkidz.com.
2. Log in, go to **Inventory**.
3. In DevTools → **Network**, select the request to `warehouse-pos-api-v2.vercel.app/api/products`.
4. Check **Response Headers:** you should see `Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com` and the request status **200**.
5. Products should load and quantities should be correct (no all-zero).

---

## Summary

| Symptom | Cause | Fix |
|--------|--------|-----|
| "access control checks" in console | API not sending CORS for your origin | Deploy API from this repo with Root Directory = **inventory-server** and redeploy |
| Products don’t load / all zero quantity | Browser blocks response, frontend gets no data | Same: fix CORS on the API project above |

Pointing the frontend to warehouse-pos-api-v2 is correct. The problem is that **that** project must serve the API code from **this** repo’s **inventory-server** so CORS is applied.
