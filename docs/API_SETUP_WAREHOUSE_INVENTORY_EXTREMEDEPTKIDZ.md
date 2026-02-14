# How APIs Should Be Set: Warehouse POS, Inventory Server, extremedeptkidz.com

This doc explains how the **warehouse-pos** frontend, the **inventory-server** API, and the **extremedeptkidz.com** domain should be wired so login, products, warehouses, and orders work.

---

## The three pieces

| Piece | What it is | Where it runs |
|-------|------------|----------------|
| **Warehouse POS** | Frontend app (React). Users open it in the browser. | Typically **https://warehouse.extremedeptkidz.com** |
| **Inventory server** | Backend API (Next.js in this repo). Serves `/api/*` and `/admin/api/*`. | Must be reachable at one base URL (see below). |
| **extremedeptkidz.com** | Your main domain. Can be the same as the API or a different app. | Depends on your deployment. |

Rule: **every API request from the warehouse app** goes to **one base URL** (no trailing slash). That base must be the **inventory-server** app. If it isn’t, you get 404s and CORS issues.

---

## One rule

**`VITE_API_BASE_URL` (in the warehouse-pos project) must point to the exact origin where the inventory-server is deployed.**

- If the inventory-server is at **https://extremedeptkidz.com** → set `VITE_API_BASE_URL=https://extremedeptkidz.com`.
- If the inventory-server is at **https://api.extremedeptkidz.com** → set `VITE_API_BASE_URL=https://api.extremedeptkidz.com`.
- If the inventory-server is at a Vercel URL like **https://inventory-server-xxx.vercel.app** → set `VITE_API_BASE_URL=https://inventory-server-xxx.vercel.app`.

The warehouse app then calls:

- `{VITE_API_BASE_URL}/admin/api/login`
- `{VITE_API_BASE_URL}/api/warehouses`
- `{VITE_API_BASE_URL}/api/products`
- `{VITE_API_BASE_URL}/api/stores`
- `{VITE_API_BASE_URL}/api/orders`
- etc.

So the **inventory-server** must be the app that answers those paths.

---

## Two common setups

### Setup A: API on the main domain (extremedeptkidz.com = inventory-server)

- **extremedeptkidz.com** is the **inventory-server** Vercel project (or that project is assigned to this domain).
- The warehouse app calls **https://extremedeptkidz.com/api/...** and **https://extremedeptkidz.com/admin/api/...**.

**Env:**

| Project | Variable | Value |
|---------|----------|--------|
| **Warehouse POS** (warehouse.extremedeptkidz.com) | `VITE_API_BASE_URL` | `https://extremedeptkidz.com` |
| **Warehouse POS** | `VITE_SUPER_ADMIN_EMAILS` | Your admin email(s), comma-separated (optional but recommended) |
| **Inventory server** (extremedeptkidz.com) | `CORS_ORIGINS` | `https://warehouse.extremedeptkidz.com,https://extremedeptkidz.com` |
| **Inventory server** | (others) | Supabase, `SESSION_SECRET`, `ALLOWED_ADMIN_EMAILS`, etc. |

Result: warehouse app and API are on different origins (warehouse vs main), so CORS is required. The inventory-server middleware uses `CORS_ORIGINS` to allow the warehouse origin.

---

### Setup B: API on a subdomain (api.extremedeptkidz.com = inventory-server)

- **extremedeptkidz.com** is a different app (e.g. main site).
- **api.extremedeptkidz.com** (or another URL) is the **inventory-server** project.

**Env:**

| Project | Variable | Value |
|---------|----------|--------|
| **Warehouse POS** (warehouse.extremedeptkidz.com) | `VITE_API_BASE_URL` | `https://api.extremedeptkidz.com` (or the real inventory-server URL) |
| **Warehouse POS** | `VITE_SUPER_ADMIN_EMAILS` | Your admin email(s) (optional but recommended) |
| **Inventory server** (api.extremedeptkidz.com) | `CORS_ORIGINS` | `https://warehouse.extremedeptkidz.com,https://extremedeptkidz.com` (if main site also calls API) |
| **Inventory server** | (others) | Same as above. |

Result: warehouse app calls the API subdomain; CORS must allow `https://warehouse.extremedeptkidz.com`.

---

## Checklist

### Warehouse POS project (frontend)

- [ ] **`VITE_API_BASE_URL`** = full URL of the **inventory-server** including **`https://`** (e.g. `https://warehouse-pos-api-v2-xxxx.vercel.app`). No trailing slash. Without the protocol, login requests go to the wrong host (405 / invalid credentials).  
  Examples: `https://extremedeptkidz.com` or `https://api.extremedeptkidz.com`.
- [ ] **`VITE_SUPER_ADMIN_EMAILS`** (optional) = your admin email(s), comma-separated, so your login gets the Admin Control Panel.
- [ ] Redeploy after changing env vars (Vite bakes them into the build).

### Inventory server project (API)

- [ ] Deployed and reachable at the same URL you set as `VITE_API_BASE_URL`.
- [ ] **`CORS_ORIGINS`** (or **`FRONTEND_ORIGIN`**) includes `https://warehouse.extremedeptkidz.com` so the browser allows requests from the warehouse app.
- [ ] **`ALLOWED_ADMIN_EMAILS`** = same admin email(s) so login returns an admin role.
- [ ] **Supabase** (or DB) and **`SESSION_SECRET`** set so auth and data work.

### extremedeptkidz.com

- [ ] If you use **Setup A**: the domain is assigned to the **inventory-server** Vercel project so `/api/*` and `/admin/api/*` are served by it.
- [ ] If you use **Setup B**: the domain can stay on the main site; the warehouse uses `VITE_API_BASE_URL` pointing to the API subdomain/URL.

---

## Quick test

1. **API base**  
   Open the warehouse app → Login page. At the bottom it shows **API: &lt;url&gt;**. That URL must be the inventory-server base.

2. **CORS**  
   From terminal:
   ```bash
   curl -X OPTIONS "https://YOUR_API_BASE/api/warehouses" \
     -H "Origin: https://warehouse.extremedeptkidz.com" \
     -H "Access-Control-Request-Method: GET" \
     -i
   ```
   Response headers should include:
   - `Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com`
   - `Access-Control-Allow-Credentials: true`

3. **404 vs API**  
   If you see 404 on `/api/warehouses` or `/admin/api/login`, the URL in `VITE_API_BASE_URL` is **not** serving the inventory-server. Fix either the domain (Setup A) or set `VITE_API_BASE_URL` to the real API URL (Setup B).

---

## Summary

- **Warehouse POS** only needs **one** API base: **`VITE_API_BASE_URL`**.
- That URL **must** be the **inventory-server** app (this repo’s Next.js API).
- **extremedeptkidz.com** can be that app (Setup A) or a different app; if different, the API must live at another URL and the warehouse must point there.
- **Inventory server** must allow the warehouse origin in **CORS** (`CORS_ORIGINS` or `FRONTEND_ORIGIN`).

Get these three aligned (warehouse → correct API URL, API allows warehouse origin, API has auth/DB configured) and login, warehouses, products, and orders will work.
