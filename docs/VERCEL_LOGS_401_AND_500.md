# Vercel logs: 401 on /vite.svg vs 500 on API

## Two different Vercel projects

| Project | What it deploys | Typical URL | Logs show |
|--------|-----------------|-------------|-----------|
| **warehouse-pos** | Frontend (Vite SPA) | e.g. warehouse.extremedeptkidz.com | Requests to your app (HTML, /vite.svg, etc.) |
| **warehouse-pos-api-v2** (or API project) | Backend (inventory-server) | e.g. warehouse-pos-api-v2.vercel.app | API requests (/api/products, /admin/api/me, etc.) |

- **Product 500 / “Error loading products”** → fix env and check logs in the **API** project (see `inventory-server/SERVER_ERROR_500.md`).
- **401 on /vite.svg** in the **frontend** project → see below.

---

## Why you see 401 on `/vite.svg` (frontend project)

In the **warehouse-pos** (frontend) project logs you may see:

- **GET /vite.svg** → **401 Unauthorized**
- **User-Agent:** `vercel-favicon/1.0`

That request is from Vercel’s favicon checker. It has no cookies or auth.

- Your `vercel.json` rewrites all non-`/assets/` paths to `/index.html`, so `/vite.svg` is served as the SPA (index.html).
- If **Vercel Deployment Protection** (Password Protection or Vercel Authentication) is enabled on this project, any request without the right cookie/header gets **401**.
- So the favicon request gets 401. Real users loading the app in a browser with a session get 200 and the app works.

So: **401 on /vite.svg is from Deployment Protection, not from your app code.** It’s harmless for logged-in users.

**If you want to remove those 401s:**

1. Vercel dashboard → **warehouse-pos** (frontend) project.
2. **Settings → Deployment Protection**.
3. For **Production** (and Preview if you use it): disable “Vercel Authentication” or “Password Protection”, or add an exception for the production domain if supported.

---

## Where to look for API 500 / product load errors

1. Open the Vercel project that deploys **inventory-server** (e.g. **warehouse-pos-api-v2**).
2. Go to **Deployments → latest deployment → Logs** (or **Functions**).
3. Reproduce loading products in the app.
4. Find the log line for **GET /api/products** (or `/admin/api/products`). The backend logs with `[api/products GET]` and the real error (e.g. missing Supabase env or DB error).

That’s where you’ll see the cause of “Server error (500) loading products,” not in the frontend project logs.
