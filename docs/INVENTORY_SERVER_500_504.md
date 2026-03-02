# Inventory API 500 / 504 — Checklist

When `https://inventory-server-iota.vercel.app/api/products` returns **500** or **504**:

## 504 Gateway Timeout

- **Cause:** The serverless function ran longer than Vercel’s limit (often 10s on Hobby).
- **Fix in code:** `app/api/products/route.ts` exports `maxDuration = 30` so the route can run up to 30s. Redeploy the **inventory-server** project so this is live.
- **Vercel:** In the project (inventory-server-iota), ensure the plan allows the duration you need; increase Function Max Duration in Settings → Functions if required.

## 500 Internal Server Error

- **Cause:** Env missing, DB error, or uncaught exception (e.g. missing table/column).
- **Checks:**
  1. **Deploy the right app**  
     The project that serves `inventory-server-iota.vercel.app` must build from this repo with **Root Directory** = `inventory-server` (or the folder that contains `app/api/products/route.ts`). Push to `main` and confirm that project’s latest deployment includes the products route.
  2. **Env on the inventory-server project**  
     In Vercel → Project → Settings → Environment Variables, set:
     - `SUPABASE_URL` — Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY` — service role key (or the key your app uses)
     Redeploy after changing env.
  3. **DB schema**  
     If the error message mentions a missing column or relation, run the migrations in `inventory-server/supabase/migrations/` (e.g. `size_kind`, `color`, `warehouse_products`, `warehouse_inventory`, `warehouse_inventory_by_size`, `size_codes`) in your Supabase project.
  4. **See the real error**  
     After the CORS fix, 500 responses include a JSON body. In Network tab, open the failing request and check **Response** for the `error` field.

## Deploy inventory-server after code changes

From the repo root (e.g. `warehouse-pos/`):

```bash
git add -A
git commit -m "fix: products API timeout and docs"
git push origin main
```

Then in Vercel, ensure the project for **inventory-server-iota.vercel.app** is connected to this repo and uses **Root Directory** `inventory-server`. Trigger a redeploy if it doesn’t run automatically.
