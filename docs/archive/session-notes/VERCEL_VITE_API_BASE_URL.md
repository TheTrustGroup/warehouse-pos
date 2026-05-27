# Where to set VITE_API_BASE_URL

## Summary

- **Which project:** The **Vercel project that builds and deploys the frontend** (this Vite/React app).  
  **Not** the inventory-server / API project.
- **What it is:** The base URL of your API (no trailing slash). The app will call `{VITE_API_BASE_URL}/api/products`, `{VITE_API_BASE_URL}/api/auth/login`, etc.

---

## Option 1: Vercel (recommended for production)

1. Open [Vercel Dashboard](https://vercel.com/dashboard).
2. Select the **project that deploys the warehouse POS frontend** (the one whose build runs `npm run build` / `tsc && vite build`).
3. Go to **Settings** → **Environment Variables**.
4. Add:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://extremedeptkidz.com` (or your API base URL, e.g. your inventory-server URL if it’s separate)
   - **Environments:** Production (and Preview if you want preview deployments to use the same API).
5. **Redeploy** the project (Deployments → ⋮ on latest → Redeploy).  
   Vite only reads this at **build time**, so a new build is required for the value to apply.

---

## Option 2: In the repo (already there)

The repo has a **`.env.production`** file (committed) with:

```env
VITE_API_BASE_URL=https://extremedeptkidz.com
```

When you run `npm run build` locally or when Vercel runs it, Vite loads `.env.production` in production mode, so the build and app use that value **if the file is present** in the built repo.

If your Vercel deployment was still failing, it may have been due to the previous **build-time throw** when the env was missing (now removed). With the current code, the build no longer throws; if neither `.env.production` nor Vercel env is set, the app falls back to `https://extremedeptkidz.com` in `src/lib/api.ts`.

---

## Two Vercel projects?

If you have:

- **Project A:** Frontend (this repo, Vite build)  
- **Project B:** Backend (e.g. inventory-server)

then set **`VITE_API_BASE_URL`** in **Project A** (frontend), and set its value to the URL of Project B, e.g. `https://your-inventory-server.vercel.app`.
