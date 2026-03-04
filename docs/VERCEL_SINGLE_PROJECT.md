# Single Vercel project (frontend + API)

One Vercel project serves both the React SPA and the Next.js API from the **same origin**. No CORS or cross-origin auth issues; `/api/products` and the app share the same domain.

## Architecture

- **Root Directory:** `inventory-server`
- **Build:** `npm run build:vercel` (see below) builds the Vite app with `VITE_API_BASE_URL=""`, copies `dist/` into `inventory-server/public/`, then runs `next build`.
- **Runtime:** Next.js serves static files from `public/` (the Vite output) and handles `/api/*` and `/admin/api/*`. SPA routes (e.g. `/inventory`, `/dashboard`) are rewritten to `/index.html` so the client router works.

## Vercel setup

1. **Repository:** This repo (contains both `warehouse-pos` frontend and `inventory-server`).
2. **Root Directory:** `inventory-server`
3. **Build Command:** `npm run build:vercel` (or leave default; `inventory-server/vercel.json` sets it).
4. **Environment variables (Vercel):**
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required for API).
   - `SESSION_SECRET` (auth).
   - Optional: `CORS_ORIGINS`, `ALLOWED_ORIGINS`, `FRONTEND_ORIGIN` (not needed for same-origin; CORS still applied for any other clients).
   - **Do not set** `VITE_API_BASE_URL` for this deployment; the build script uses `VITE_API_BASE_URL=""` so the client uses relative URLs (`/api/...`).

## Local full build (optional)

From repo root (e.g. `warehouse-pos/`):

```bash
cd inventory-server
npm run build:vercel
```

Requires the parent directory to be the full repo (with `package.json`, `src/`, Vite config). To build only the API without the frontend: `npm run build`.

## How to verify it's really one project (frontend + API)

Do these checks **before** relying on same-origin behavior.

### 1. Vercel dashboard

1. Open your project in [Vercel](https://vercel.com) → **Settings**.
2. **General → Root Directory**
   - Must be **`inventory-server`** (or the path to the folder that contains `app/api/`, `next.config.js`, `vercel.json`).
   - If it's empty or the repo root, the project is **not** the combined app; set Root Directory and redeploy.
3. **Deployments** → open the latest deployment → **Building**
   - Build log should show both:
     - Vite: e.g. "Building Vite app", "Copying dist to public/".
     - Next.js: e.g. "Compiled successfully", routes like `/api/products`.
   - If you only see a Vite build and no Next.js API routes, the project is frontend-only.
4. **Environment Variables**
   - You should have `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (needed for the API).
   - You should **not** need `VITE_API_BASE_URL` for this single-project setup.

### 2. Same origin and API on the same domain

Your app URL should look like: `https://<project-name>.vercel.app` (or your custom domain).

- **App (SPA):** Open `https://<your-deployment-url>/` in a browser. You should see the Extreme Dept Kidz app (login or dashboard), not a blank page or "Cannot GET /".
- **API on same host:** In the same tab, open DevTools → **Network**. Navigate to Inventory (or any page that loads products). Find the request to **`/api/products?...`** (or `https://<same-host>/api/products?...`).
  - If the request URL's host is **the same** as the page (e.g. both `warehouse-pos-xxx.vercel.app`), it's one project.
  - If the request goes to a **different** host (e.g. `warehouse-pos-api-v2.vercel.app`), you have two projects (cross-origin); switch to single-project (Root = `inventory-server`, build:vercel) or fix CORS on the API project.
- **Health check:** Open `https://<your-deployment-url>/api/health` in a browser, or run:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" https://<your-deployment-url>/api/health
  ```
  You should get **200**. If you get 404, the API is not deployed on that URL.

### 3. Quick checklist

| Check | Expected |
|-------|----------|
| Root Directory | `inventory-server` |
| Build log shows Vite + "Copying dist to public/" | Yes |
| Build log shows Next.js + API routes | Yes |
| Visiting `/` shows the app (login/dashboard) | Yes |
| Visiting `/api/health` returns 200 | Yes |
| In-app product request goes to **same host** as the page | Same host |

If all of the above are true, it's a **single Vercel project** (frontend + API). You can proceed without `VITE_API_BASE_URL`; the client uses relative `/api/...` URLs.

---

## Why this fixes “access control checks”

With one project, the browser loads the app and the API from the same origin (e.g. `https://your-app.vercel.app`). Requests to `/api/products` are same-origin, so the browser does not apply CORS restrictions and cookies/tokens work without extra CORS or cross-origin configuration.
