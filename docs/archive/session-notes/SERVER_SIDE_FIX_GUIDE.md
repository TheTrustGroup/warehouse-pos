# Server-Side Fix Guide – Stop "Load failed" on Login

This guide is for whoever manages **extremedeptkidz.com** (the admin/API server). Follow these steps so the warehouse app at **warehouse.extremedeptkidz.com** can log in without "Load failed".

---

## 1. CORS – Allow the warehouse origin

The browser blocks the login request unless the API explicitly allows the warehouse domain.

### Required

- **Origin:** `https://warehouse.extremedeptkidz.com`
- **Credentials:** `true` (cookies / auth headers)
- **Methods:** `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Headers:** `Content-Type`, `Accept`, `Authorization`

### Option A: Laravel (PHP)

**File: `config/cors.php`**

```php
<?php

return [
    'paths' => ['admin/api/*', 'api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [
        'https://warehouse.extremedeptkidz.com',
        'https://extremedeptkidz.com',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
```

If you use a **middleware** instead:

```php
// In your CORS middleware
$response->header('Access-Control-Allow-Origin', 'https://warehouse.extremedeptkidz.com');
$response->header('Access-Control-Allow-Credentials', 'true');
$response->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
$response->header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
```

Handle **OPTIONS** (preflight): return `200` with these headers and no body.

---

### Option B: Node.js / Express

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'https://warehouse.extremedeptkidz.com',
    'https://extremedeptkidz.com',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
}));
```

---

### Option C: Nginx (reverse proxy)

Add inside the `server` or `location` that serves the API:

```nginx
add_header 'Access-Control-Allow-Origin' 'https://warehouse.extremedeptkidz.com' always;
add_header 'Access-Control-Allow-Credentials' 'true' always;
add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
add_header 'Access-Control-Allow-Headers' 'Content-Type, Accept, Authorization' always;

if ($request_method = 'OPTIONS') {
    return 204;
}
```

Then reload Nginx: `sudo nginx -t && sudo systemctl reload nginx`

---

### Option D: Vercel (if API is on Vercel)

**File: `vercel.json`** (in the API project)

```json
{
  "headers": [
    {
      "source": "/admin/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "https://warehouse.extremedeptkidz.com" },
        { "key": "Access-Control-Allow-Credentials", "value": "true" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, DELETE, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Accept, Authorization" }
      ]
    }
  ]
}
```

---

### Option E: Apache

**File: `.htaccess`** or vhost config

```apache
Header set Access-Control-Allow-Origin "https://warehouse.extremedeptkidz.com"
Header set Access-Control-Allow-Credentials "true"
Header set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
Header set Access-Control-Allow-Headers "Content-Type, Accept, Authorization"

RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]
```

---

## 2. Endpoints – Login and Products must be reachable

CORS must allow **warehouse.extremedeptkidz.com** for **all** API routes the app uses (login, products, etc.). If only login is allowed, the Inventory page will still show "Load failed" when loading products.

### Login

The warehouse app sends:

- **URL:** `POST https://extremedeptkidz.com/admin/api/login`
- **Headers:** `Content-Type: application/json`, `Accept: application/json`
- **Body:** `{ "email": "user@example.com", "password": "..." }`

The server must:

1. Respond to `POST /admin/api/login` (or the path your admin actually uses).
2. Accept JSON body with `email` and `password`.
3. Return JSON, e.g. `{ "user": { ... }, "token": "..." }` or set a session cookie and return the user.

If the real path is different (e.g. `/api/login` or `/auth/login`), either:

- Add a route that matches `POST /admin/api/login` and forwards to your real login handler, or  
- Tell the frontend team the correct URL so they can change it in the app.

### Products (Inventory)

The warehouse app also calls:

- **URL:** `GET https://extremedeptkidz.com/admin/api/products`
- **Headers:** `Accept: application/json`, plus `Authorization` if using Bearer token

The server must:

1. Respond to `GET /admin/api/products` (or the path your admin uses for products).
2. Return JSON array of products (or `[]`).
3. Allow the same CORS origin and credentials as for login.

If products return "Load failed", CORS is usually not allowing **GET** from `https://warehouse.extremedeptkidz.com` for this endpoint.

---

## 3. Reachability – Quick checks

Run these from your machine (or the server).

### Test 1: API base

```bash
curl -I "https://extremedeptkidz.com/admin/api/login"
```

Expected: `200`, `401`, `405`, or `404` (not connection refused / timeout).

### Test 2: OPTIONS (CORS preflight)

```bash
curl -X OPTIONS "https://extremedeptkidz.com/admin/api/login" \
  -H "Origin: https://warehouse.extremedeptkidz.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

Check response headers for:

- `Access-Control-Allow-Origin: https://warehouse.extremedeptkidz.com`
- `Access-Control-Allow-Credentials: true`

### Test 3: POST login (invalid credentials are OK)

```bash
curl -X POST "https://extremedeptkidz.com/admin/api/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Origin: https://warehouse.extremedeptkidz.com" \
  -d '{"email":"test@test.com","password":"test"}' \
  -v
```

Expected: `401` or `422` with a JSON body (not connection error, not CORS error in browser).

---

## 4. Checklist

- [ ] CORS allows **origin** `https://warehouse.extremedeptkidz.com`
- [ ] CORS has **credentials** `true`
- [ ] OPTIONS requests return **200/204** with CORS headers
- [ ] `POST /admin/api/login` exists (or equivalent and documented)
- [ ] Login accepts JSON `{ "email", "password" }`
- [ ] curl from the same network reaches the API (no timeout / connection refused)

---

## 5. After changing the server

1. Clear cache / restart the app server if needed.
2. In the browser, open **warehouse.extremedeptkidz.com**, try login again.
3. If it still fails, open DevTools → **Network** tab, click the failing request, and check:
   - **Request URL**
   - **Status** (e.g. 0 = blocked; 403/404 = server)
   - **Response** or **Console** for CORS/security errors

---

## 6. Quick reference

| Item | Value |
|------|--------|
| Warehouse app URL | `https://warehouse.extremedeptkidz.com` |
| API base | `https://extremedeptkidz.com` |
| Login endpoint | `POST /admin/api/login` |
| Required CORS origin | `https://warehouse.extremedeptkidz.com` |
| Credentials | `true` |

Use this doc on the server side; no code changes are needed in the warehouse app for CORS—only on **extremedeptkidz.com**.
