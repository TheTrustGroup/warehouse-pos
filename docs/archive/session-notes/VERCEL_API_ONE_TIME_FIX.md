# One-time fix: API project always using "dist" (Vite) and failing

The **warehouse-pos-api** project was created or merged with config that expects **Vite** and **outputDirectory: "dist"**. Redeploying keeps using that. Fix it once by creating a **new** API project that never sees the frontend config.

---

## Step 1: Create a new API project (do not reuse the old one)

1. In Vercel: **Add New** → **Project**.
2. **Import** the same repo: **TheTrustGroup/warehouse-pos**.
3. **Project name:** e.g. **warehouse-pos-api-v2** (so it’s clear it’s the API).

---

## Step 2: Set only these (nothing else)

Before deploying, set these and **do not** set Output Directory or any override.

| Setting | Value |
|--------|--------|
| **Root Directory** | `inventory-server` |
| **Include files outside the root directory in the Build Step** | **Off** |
| **Framework Preset** | **Next.js** |
| **Build Command** | `npm run build` (default) |
| **Install Command** | `npm install` (default) |
| **Output Directory** | Leave **empty** (do not type `dist` or anything). |

Do **not** enable any “Override” for Output Directory. Leave it at the default (empty) for Next.js.

---

## Step 3: Add environment variables

In the new project, **Settings** → **Environment Variables**:

- `SUPABASE_URL` = your Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` = your service role key  
- `CORS_ORIGINS` = `https://warehouse.extremedeptkidz.com` or `*`

Apply to **Production** (and Preview if you want).

---

## Step 4: Deploy

Click **Deploy**. Wait for the build to finish. It should succeed (Next.js build, no “dist” error).

Test:

- `https://warehouse-pos-api-v2.vercel.app/` → “Inventory (Nuclear — Server only)”.
- `https://warehouse-pos-api-v2.vercel.app/api/products` → JSON.
- `https://warehouse-pos-api-v2.vercel.app/api/health` → JSON.

---

## Step 5: Point the frontend at the new API URL

1. Open the **warehouse-pos** (frontend) project in Vercel.
2. **Settings** → **Environment Variables**.
3. Set **`VITE_API_BASE_URL`** = `https://warehouse-pos-api-v2.vercel.app` (no trailing slash).
4. Save, then **Redeploy** the frontend.

---

## Step 6 (optional): Use the old domain on the new project

If you want to keep using **warehouse-pos-api.vercel.app**:

1. In the **old** project (warehouse-pos-api): **Settings** → **Domains** → remove **warehouse-pos-api.vercel.app**.
2. In the **new** project (warehouse-pos-api-v2): **Settings** → **Domains** → **Add** → **warehouse-pos-api.vercel.app**.
3. In the **frontend** project, set **`VITE_API_BASE_URL`** = `https://warehouse-pos-api.vercel.app` again and redeploy.

Then you can delete the old **warehouse-pos-api** project if you don’t need it.

---

## Why this works

The old project had “Production Overrides” (Vite + dist) baked in. New deployments kept using that. A **new** project has no overrides, so it uses only **Next.js** and the default output. The API app lives in **inventory-server**, so with Root Directory = `inventory-server` and “Include files outside” = Off, the build never uses the root **vercel.json** (which has `outputDirectory: "dist"` for the Vite frontend).
