# Products not loading – fix in 2 steps

You’re seeing **“Loading products…”** forever and **401 / 404** in the console because of **where** the API runs and **where** you set the variables.

---

## You have two different Vercel projects

| Vercel project name   | What it runs        | URL (example)                    | Needs these env vars |
|-----------------------|---------------------|----------------------------------|-----------------------|
| **warehouse-pos**     | Frontend (React)    | warehouse.extremedeptkidz.com    | `VITE_API_BASE_URL`, `VITE_SUPER_ADMIN_EMAILS` only. **No Supabase.** |
| **warehouse-pos-api-v2** | Backend API (inventory-server) | **warehouse-pos-api-v2.vercel.app** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `CORS_ORIGINS`, etc. |

The frontend calls **warehouse-pos-api-v2.vercel.app**. That URL is served by the **warehouse-pos-api-v2** project, not by **warehouse-pos**.

---

## What’s wrong

You added **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** to the **warehouse-pos** project.

- **warehouse-pos** = frontend. It does **not** connect to Supabase. Those variables there do nothing for the API.
- The app that **does** connect to Supabase (and returns products) is **warehouse-pos-api-v2**. That project never got the Supabase variables, so it can’t load products and you get 500/401 and “Loading products…” forever.

---

## What to do

### 1. Add the variables to the **API** project

1. In Vercel, open the project that **actually serves**  
   **https://warehouse-pos-api-v2.vercel.app**  
   (its name is usually **warehouse-pos-api-v2** or similar – check **Settings → Domains** to see which project has that URL).
2. In **that** project: **Settings → Environment Variables**.
3. Add:
   - **SUPABASE_URL** = your Supabase project URL (Supabase → Settings → API → Project URL).
   - **SUPABASE_SERVICE_ROLE_KEY** = your Supabase service_role key (Settings → API → Project API keys → `service_role`).
4. Save. Apply to **Production** (and Preview if you use it).
5. **Redeploy that project** (Deployments → … → Redeploy). The API only reads env at deploy time.

### 2. In the **frontend** project (warehouse-pos)

- Keep **VITE_API_BASE_URL** = `https://warehouse-pos-api-v2.vercel.app` (no trailing slash).
- You can **remove** SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from **warehouse-pos**; the frontend doesn’t use them.
- After any env change there, redeploy **warehouse-pos** so the new build is used.

---

## After that

- Products should load from the API.
- 401 on `/admin/api/me` / `/api/auth/user`: if they persist, log out and log in again; the API may need a fresh session. If it still fails, check **SESSION_SECRET** and **CORS_ORIGINS** in the **warehouse-pos-api-v2** project.
- 404 on `/api/ping`: the API only has `/api/health`. That 404 is harmless; the app will use `/api/health` for reachability.

Summary: **Supabase variables must live in the project that deploys the API (warehouse-pos-api-v2), not in the frontend project (warehouse-pos).**
