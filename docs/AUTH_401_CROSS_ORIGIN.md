# 401 on /api/products (cross-origin)

When the frontend and the inventory API are on **different origins** (e.g. app on `app.example.com`, API on `inventory-server-iota.vercel.app`), the browser does **not** send cookies with requests to the API. That leads to **401 Unauthorized** on `GET /api/products` and other protected routes.

## Fix (client already implemented)

1. **Login response**  
   The backend used for login (e.g. `/admin/api/login` or `/api/auth/login`) should return a **token** in the response body, e.g.:
   - `{ "user": {...}, "token": "eyJ..." }` or
   - `{ "data": { "user": {...}, "token": "eyJ..." } }` or
   - `access_token` instead of `token`

   The frontend stores this in `localStorage.auth_token` and sends `Authorization: Bearer <token>` on every request to the inventory API.

2. **Session check (/me or /api/auth/user)**  
   If the session endpoint (e.g. `/admin/api/me` or `/api/auth/user`) returns **200** with a body that includes `token` or `access_token`, the frontend now stores it. That way, after a refresh or when the user was authenticated via cookie-only login, we still get a token for cross-origin API calls.

## Backend requirements

- **Login:** Return `token` or `access_token` in the JSON body so the client can store it.
- **/me or /api/auth/user:** Optionally include `token` or `access_token` in the response so the client can persist it after session check (e.g. on page load).

If the inventory-server is the same app that handles login, ensure the login route returns a JWT (or session token) in the body; the client will send it as `Authorization: Bearer` to `/api/products`.
