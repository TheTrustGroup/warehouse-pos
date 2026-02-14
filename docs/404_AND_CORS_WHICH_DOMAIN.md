# 404 on /api/warehouses – Which Domain Serves the API?

If the warehouse app shows **"Origin … is not allowed. Status code: 404"** for `https://extremedeptkidz.com/api/warehouses`, two things are going on:

1. **404** – The server that answers for **extremedeptkidz.com** does **not** have a route for `/api/warehouses`. So the request is hitting a different app (e.g. main site) that returns 404.
2. **CORS** – That 404 response often doesn’t send the right CORS headers, so the browser reports both 404 and “origin not allowed”.

The **inventory-server** in this repo **does** have `/api/warehouses`. So the fix is to make sure the warehouse app calls the **same** deployment that is the inventory-server.

---

## Check: Where is the inventory-server actually deployed?

- In **Vercel**: you may have two projects:
  - **Project A** – main site / marketing (deployed at **extremedeptkidz.com**)
  - **Project B** – inventory-server (deployed at e.g. **inventory-server-xxx.vercel.app** or another domain)

If **extremedeptkidz.com** is linked to **Project A**, then requests to `https://extremedeptkidz.com/api/warehouses` go to Project A, which has no such route → **404**.

---

## Fix (choose one)

### Option 1: Use the inventory-server URL in the warehouse app

If the **inventory-server** is deployed at a **different** URL (e.g. `https://inventory-server-xxx.vercel.app` or `https://api.extremedeptkidz.com`):

1. In the **warehouse-pos** frontend (the app that becomes warehouse.extremedeptkidz.com), set the API base to that URL:
   - In **Vercel** env for the warehouse frontend:  
     `VITE_API_BASE_URL` = that URL (e.g. `https://api.extremedeptkidz.com` or the inventory-server’s Vercel URL).
   - Or in **.env.production** / **.env.local** when building:  
     `VITE_API_BASE_URL=https://...` (same value).
2. Redeploy the **warehouse** frontend so it uses the new `VITE_API_BASE_URL`.
3. Ensure **CORS** on the inventory-server allows `https://warehouse.extremedeptkidz.com` (you already did this; the inventory-server middleware handles it).

Then the warehouse app will call the real API; no more 404 for `/api/warehouses`, and CORS will be correct.

---

### Option 2: Serve the inventory-server at extremedeptkidz.com

If you want the API to live at **https://extremedeptkidz.com/api/...**:

1. In **Vercel**, open the project that is the **inventory-server** (the one with `app/api/warehouses/`, etc.).
2. Go to **Settings → Domains**.
3. Add **extremedeptkidz.com** (and optionally **www.extremedeptkidz.com**) to this project.
4. If the main site currently uses extremedeptkidz.com, you’ll need to either:
   - Move the main site to another domain or subdomain, or
   - Use **Vercel’s “multi-project” setup** so that one domain routes `/api/*` to the inventory-server and the rest to the main site (requires Vercel config or a proxy).

After this, `https://extremedeptkidz.com/api/warehouses` will be served by the inventory-server and the 404 will go away (and CORS will work as already configured).

---

## Quick check

From your machine:

```bash
# Replace with the URL that should be the inventory-server (extremedeptkidz.com or the inventory-server’s Vercel URL)
curl -s -o /dev/null -w "%{http_code}" "https://extremedeptkidz.com/api/warehouses"
```

- **401** or **200** → that domain is serving the inventory-server (route exists; 401 = not logged in).
- **404** → that domain is **not** serving the inventory-server; use Option 1 or 2 above.

---

## Summary

| Symptom | Meaning | Fix |
|--------|--------|-----|
| 404 on `/api/warehouses` | Domain is not the inventory-server | Point frontend to inventory-server URL (Option 1) or point domain to inventory-server (Option 2). |
| CORS “not allowed” with 404 | 404 response often has no CORS headers | Fix the 404 (correct API URL or domain) so requests hit the inventory-server; CORS is already set there. |
