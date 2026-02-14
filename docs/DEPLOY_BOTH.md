# Deploy both: Frontend + API (inventory-server)

You run **two separate deployments**: the **API** (inventory-server) and the **frontend** (Vite app). Both can live in the same repo; Vercel uses the **Root Directory** to build the right one.

---

## Option A: Deploy via Git (recommended)

### 1. Push your branch

```bash
cd warehouse-pos
git push origin main
```

### 2. API (inventory-server)

- In **Vercel**: open the project whose **Root Directory** is **`warehouse-pos/inventory-server`** (or create one and set root to that).
- Ensure **Production** (and Preview if you want) use the same branch you pushed (e.g. `main`).
- Vercel will build and deploy on every push to that branch.
- **Env vars** (Settings → Environment Variables): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS` (e.g. `https://warehouse.extremedeptkidz.com`).
- After deploy, note the API URL (e.g. `https://warehouse-pos-api-v2.vercel.app` or your custom domain).

### 3. Frontend (warehouse-pos)

- In **Vercel**: open the project whose **Root Directory** is **`warehouse-pos`** (the Vite app, not the repo root unless your repo root is `warehouse-pos`).
- Set **Environment Variables** → `VITE_API_BASE_URL` = your API URL from step 2 (no trailing slash).
- Trigger a new deployment (Deployments → … → Redeploy, or push a commit). The frontend build bakes `VITE_API_BASE_URL` in at build time.

---

## Option B: Deploy from CLI

```bash
# From repo root (parent of warehouse-pos)
cd "World-Class Warehouse Inventory & Smart POS System/warehouse-pos"

# Deploy API (inventory-server) — run from repo root, specify root for API
vercel --prod -c --cwd inventory-server
# Or if your Vercel API project is linked to inventory-server folder:
cd inventory-server && vercel --prod && cd ..

# Deploy frontend (warehouse-pos)
vercel --prod
# (Run from warehouse-pos if that’s the frontend root.)
```

If you use two Vercel projects, link each folder to its project first:

```bash
cd warehouse-pos/inventory-server
vercel link   # choose the API project

cd ..         # back to warehouse-pos
vercel link   # choose the frontend project
```

Then `vercel --prod` from each directory deploys that app.

---

## Checklist

| Step | API (inventory-server) | Frontend (warehouse-pos) |
|------|-------------------------|---------------------------|
| Root | `warehouse-pos/inventory-server` | `warehouse-pos` |
| Env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS` | `VITE_API_BASE_URL` = API URL |
| After deploy | Copy API URL | Set `VITE_API_BASE_URL`, then redeploy |

**Cron (optional):** The API’s `vercel.json` hits `/api/health` every 5 minutes. Vercel Cron may require a paid plan; if cron doesn’t run, the app still works (warmup and retries handle cold start).

More detail: [VERCEL_PRODUCTION_API.md](../VERCEL_PRODUCTION_API.md).
