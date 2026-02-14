# Steps to Fix CORS (warehouse.extremedeptkidz.com → extremedeptkidz.com)

The warehouse app at **https://warehouse.extremedeptkidz.com** calls the API at **https://extremedeptkidz.com**. The browser blocks these requests until the API **allows that origin** in CORS. Follow the steps below for your setup.

---

## Step 1: Identify which backend serves extremedeptkidz.com

- **If the API is the Next.js app in this repo** (`inventory-server`) deployed at extremedeptkidz.com → use **Option A**.
- **If the API is something else** (Laravel, Express, another Next.js app, Vercel serverless, etc.) → use **Option B** and the examples in **SERVER_SIDE_FIX_GUIDE.md**.

---

## Option A: API is this repo’s inventory-server (Next.js)

The `inventory-server` middleware already handles CORS; it just needs to know the warehouse origin.

### 1. Set environment variables

On the host where **extremedeptkidz.com** runs (e.g. Vercel, your server), set **one** of:

**Option 1 – Explicit list (recommended for production)**

```bash
CORS_ORIGINS=https://warehouse.extremedeptkidz.com,https://extremedeptkidz.com
```

**Option 2 – Single frontend origin (middleware will also reflect request origin when not strict)**

```bash
FRONTEND_ORIGIN=https://warehouse.extremedeptkidz.com
```

Use the same variable names in your deployment (Vercel → Project Settings → Environment Variables; or `.env.production`, etc.).

### 2. Redeploy

Redeploy the API so the new env is applied (e.g. push to main if auto-deploy, or trigger a new deployment).

### 3. Verify

Run the [Verify CORS](#verify-cors) steps below.

---

## Option B: API is not this repo (Laravel, Express, Nginx, Vercel, etc.)

You must add CORS headers on **every API response** (including OPTIONS) so that:

1. **Origin** `https://warehouse.extremedeptkidz.com` is allowed.
2. **Credentials** are allowed (required for cookies/auth).

### What to add

- **Access-Control-Allow-Origin:** `https://warehouse.extremedeptkidz.com` (do **not** use `*` when using credentials).
- **Access-Control-Allow-Credentials:** `true`
- **Access-Control-Allow-Methods:** `GET, POST, PUT, PATCH, DELETE, OPTIONS`
- **Access-Control-Allow-Headers:** `Content-Type, Accept, Authorization, Idempotency-Key`

Apply this to **all** API routes the warehouse app uses (e.g. `/api/*`, `/admin/api/*`).

### Where to add it

- **Laravel:** `config/cors.php` or CORS middleware – see **SERVER_SIDE_FIX_GUIDE.md** (Option A).
- **Node/Express:** `cors()` middleware – see SERVER_SIDE_FIX_GUIDE.md (Option B).
- **Nginx:** `add_header` in the `server`/`location` for the API – see SERVER_SIDE_FIX_GUIDE.md (Option C).
- **Vercel:** `vercel.json` headers for `/api` and `/admin/api` – see SERVER_SIDE_FIX_GUIDE.md (Option D).
- **Apache:** `.htaccess` or vhost – see SERVER_SIDE_FIX_GUIDE.md (Option E).

Full examples and copy-paste snippets are in **SERVER_SIDE_FIX_GUIDE.md** in the repo root.

### Handle OPTIONS (preflight)

Browsers send an **OPTIONS** request before POST/GET. Your server must respond to OPTIONS with **204** or **200** and the same CORS headers above (no body needed).

---

## Verify CORS

After changing the server:

### 1. OPTIONS preflight

```bash
curl -X OPTIONS "https://extremedeptkidz.com/api/products" \
  -H "Origin: https://warehouse.extremedeptkidz.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -i
```

Check the response headers. You should see:

- `Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com`
- `Access-Control-Allow-Credentials: true`

### 2. In the browser

1. Open **https://warehouse.extremedeptkidz.com** and log in.
2. Open DevTools → **Console**.
3. Go to **Inventory** (or Dashboard).

You should **not** see errors like:

- “Origin https://warehouse.extremedeptkidz.com is not allowed by Access-Control-Allow-Origin”
- “Fetch API cannot load … due to access control checks”

Products and warehouses should load; the yellow “Server temporarily unavailable” banner should go away once the circuit breaker sees successful responses.

---

## Quick reference

| Item | Value |
|------|--------|
| Warehouse app (origin) | `https://warehouse.extremedeptkidz.com` |
| API base | `https://extremedeptkidz.com` |
| Origin to allow | `https://warehouse.extremedeptkidz.com` |
| Credentials | `true` (required) |
| inventory-server env (Option A) | `CORS_ORIGINS=https://warehouse.extremedeptkidz.com,https://extremedeptkidz.com` or `FRONTEND_ORIGIN=https://warehouse.extremedeptkidz.com` |

---

## If it still fails

- Confirm the **exact** URL of the API (e.g. `https://extremedeptkidz.com` vs `https://api.extremedeptkidz.com`). The warehouse app uses `VITE_API_BASE_URL`; it must match the server you changed.
- In DevTools → **Network**, click the failing request and check **Response Headers** for `Access-Control-Allow-Origin`. If it’s missing or different, CORS is still wrong on that endpoint.
- Ensure CORS is applied to **all** routes the app calls: login, products, warehouses, orders, sync-rejections, etc.
