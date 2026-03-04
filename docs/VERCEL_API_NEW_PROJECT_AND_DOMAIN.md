# New Vercel API project and custom domain (api.customdomain.com)

Use this when the **existing** API project keeps failing the build (e.g. “Module not found: Can't resolve '@/lib/...'”) or when you want a **dedicated API URL** like **api.yourdomain.com**.

---

## 1. Why create a new API project?

- **Root Directory** might be wrong on the current project (e.g. building from repo root instead of `inventory-server`), which breaks path resolution.
- A **new project** lets you set Root Directory correctly from scratch and avoid cached build config.
- You can attach a **custom domain** (e.g. `api.customdomain.com`) to the new project so the frontend and other apps point to a stable URL.

---

## 2. Create a new Vercel project for the API

1. **Vercel Dashboard** → **Add New** → **Project**.
2. **Import** the same Git repo: `TheTrustGroup/warehouse-pos` (or your fork). Same branch: `main`.
3. **Configure:**
   - **Root Directory:** Click **Edit**, set to **`inventory-server`**. (This is critical: the build must run from the folder that contains `package.json`, `lib/`, `app/`, and `tsconfig.json` for the Next.js API.)
   - **Framework Preset:** Next.js (should be auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** leave default (Next.js handles it).
   - **Install Command:** `npm install`.
4. **Environment variables** (add before first deploy, or right after):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
   - `ALLOWED_ADMIN_EMAILS` (optional)
   - `POS_PASSWORD_CASHIER_MAIN_STORE`, `POS_PASSWORD_MAIN_TOWN` (or as in `ENV_SETUP.md`)
   - **CORS:** `CORS_ORIGINS` = your frontend origin(s), e.g. `https://warehouse.yourdomain.com,https://your-app.vercel.app`  
     Or set `FRONTEND_ORIGIN` if you use that in middleware.
5. Deploy. Note the new URL (e.g. `https://inventory-server-xxx.vercel.app`).

---

## 3. Point the frontend to the new API

- In the **frontend** Vercel project (or your frontend env), set:
  - **`VITE_API_BASE_URL`** = the new API URL (e.g. `https://inventory-server-xxx.vercel.app` or, after adding a custom domain, `https://api.customdomain.com`).
- Redeploy the frontend so it picks up the new env. If you use `.env.production` or Vercel env, set it there and trigger a redeploy.

---

## 4. Custom domain: api.customdomain.com

To use a URL like **api.customdomain.com** for the API (same pattern as your other project):

1. In the **API** Vercel project → **Settings** → **Domains**.
2. **Add** the domain: `api.customdomain.com` (replace with your real subdomain and domain).
3. Vercel will show DNS instructions:
   - **Recommended:** Add a **CNAME** record: `api` → `cname.vercel-dns.com` (or the target Vercel gives you).
   - Or use **A** records if you prefer (Vercel shows the IPs).
4. After DNS propagates, Vercel will issue SSL and the API will be available at `https://api.customdomain.com`.
5. Set **`VITE_API_BASE_URL`** (frontend) to `https://api.customdomain.com`.
6. **CORS:** Add your frontend origin to `CORS_ORIGINS` (e.g. `https://warehouse.customdomain.com`) so the browser allows requests from the frontend to `https://api.customdomain.com`.

---

## 5. Checklist

| Step | Action |
|------|--------|
| 1 | New Vercel project, same repo, branch `main` |
| 2 | Root Directory = **`inventory-server`** |
| 3 | Add env vars (SUPABASE_*, SESSION_SECRET, CORS_ORIGINS / FRONTEND_ORIGIN, POS passwords) |
| 4 | Deploy and confirm build succeeds |
| 5 | (Optional) Add domain `api.customdomain.com` in project Settings → Domains and configure DNS |
| 6 | Set frontend `VITE_API_BASE_URL` to the new API URL (or custom domain) and redeploy frontend |

---

## 6. If build still fails on the new project

- Double-check **Root Directory** is exactly `inventory-server` (no trailing slash, no typo).
- In the repo, `inventory-server` must contain `package.json`, `next.config.js` (or similar), `lib/`, `app/`, and `tsconfig.json`.
- If the repo root is *already* the API (no `inventory-server` folder), then leave Root Directory blank and ensure the repo has the API code at root.

See **docs/CONNECT.md** for general run/deploy and **docs/ARCHITECTURE_AND_ROADMAP.md** for API surface and env.
