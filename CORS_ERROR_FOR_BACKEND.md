# CORS Error – Copy This to Backend

The browser console on **warehouse.extremedeptkidz.com** shows:

```
Origin https://warehouse.extremedeptkidz.com is not allowed by Access-Control-Allow-Origin. Status code: 204
Fetch API cannot load https://extremedeptkidz.com/api/products due to access control checks.
```

**Meaning:** The server at **extremedeptkidz.com** is **not** allowing requests from **warehouse.extremedeptkidz.com**. The browser blocks the request before it reaches your API.

---

## What the backend must do

1. **Allow this origin:** `https://warehouse.extremedeptkidz.com`
2. **Allow credentials:** `true` (so cookies/auth work)
3. **Apply to all API routes** the app uses, including:
   - `GET /admin/api/products` (or `/api/products`)
   - `POST /admin/api/login`
   - `GET /admin/api/me`
   - `GET /api/orders` (or `/admin/api/orders`)

---

## Exact CORS headers to send

For **every** response from your API (including OPTIONS preflight), send:

```
Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept, Authorization
```

**Important:** Do **not** use `*` for `Access-Control-Allow-Origin` when using credentials. It must be exactly `https://warehouse.extremedeptkidz.com`.

---

## Full instructions

See **SERVER_SIDE_FIX_GUIDE.md** in this repo for Laravel, Node, Nginx, Vercel, and Apache examples.

---

## How to confirm it’s fixed

1. Backend adds the CORS origin and credentials as above.
2. User opens **warehouse.extremedeptkidz.com** → Inventory.
3. Console should have **no** “not allowed by Access-Control-Allow-Origin” or “access control checks” errors.
4. Products (and login/orders) should load instead of “Cannot reach the server”.
