# Vercel: Production API (inventory-server) + Frontend

The warehouse frontend needs a **live API** to load and save inventory. On Vercel you run **two projects** from the same repo: one for the API, one for the frontend.

---

## 1. Deploy the API (inventory-server)

### Create a second Vercel project

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. **Import** the same Git repository (e.g. the one that contains `warehouse-pos`).
3. **Configure:**
   - **Root Directory:** click **Edit**, set to **`warehouse-pos/inventory-server`** (not the repo root).
   - **Framework Preset:** Next.js (auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** leave default.
4. **Environment variables** (Settings → Environment Variables) — add for **Production** (and Preview if you want):

   | Name | Value | Notes |
   |------|--------|--------|
   | `SUPABASE_URL` | your Supabase project URL | From Supabase dashboard |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service role key | From Supabase dashboard |
   | `CORS_ORIGINS` | your frontend URL(s) | See below |

   **CORS_ORIGINS:** Comma-separated list of allowed origins, e.g.  
   `https://warehouse-pos.vercel.app,https://warehouse.extremedeptkidz.com`  
   Or use `*` to allow any origin (simpler, less strict).

5. **Deploy.** Note the deployment URL, e.g. `https://inventory-server-xxx.vercel.app` (or your custom domain like `https://api.extremedeptkidz.com`).

---

## 2. Point the frontend to the API

In the **warehouse-pos** Vercel project (the one that builds the **Vite** app from the repo root or `warehouse-pos`):

1. **Settings** → **Environment Variables**.
2. Add (or update):

   | Name | Value | Environment |
   |------|--------|-------------|
   | `VITE_API_BASE_URL` | Your API base URL | Production (and Preview if desired) |

   Examples:
   - `https://inventory-server-xxx.vercel.app`
   - `https://api.extremedeptkidz.com` (if you attached a custom domain to the API project)

   **No trailing slash.** The app will call `{VITE_API_BASE_URL}/api/products`, etc.

3. **Redeploy** the warehouse-pos project (e.g. trigger a new deployment or push a commit) so the new value is baked into the build.

---

## 3. Summary

| Project | Root directory | Purpose | Env vars |
|--------|-----------------|--------|----------|
| **API** | `warehouse-pos/inventory-server` | Serves `/api/products`, etc. | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS` |
| **Frontend** | `warehouse-pos` (or repo root if that’s how you added it) | Vite SPA | `VITE_API_BASE_URL` = API URL |

After both are deployed and `VITE_API_BASE_URL` is set and redeployed, the production app will use the live API and “Could not reach server” should stop.

---

## Optional: Custom domain for the API

In the **inventory-server** project on Vercel: **Settings** → **Domains** → add e.g. `api.extremedeptkidz.com`. Then set **Frontend** env `VITE_API_BASE_URL=https://api.extremedeptkidz.com` and redeploy the frontend.
