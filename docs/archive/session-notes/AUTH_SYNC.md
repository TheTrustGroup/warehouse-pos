# Authentication Sync – Summary

## Login credentials (unchanged)

- **Email:** `info@extremedeptkidz.com`
- **Password:** `Admin123!@#`

Use these on the warehouse POS login page. Email is normalized (trimmed, lowercased) before sending.

---

## Changes made for reliable auth

### 1. API base URL

- **Before:** `.env.local` used `VITE_API_BASE_URL=https://api.extremedeptkidz.com` (different host).
- **After:** `VITE_API_BASE_URL=https://extremedeptkidz.com` so `/admin/api/*` is on the **same origin** as the admin panel.
- **Reason:** Admin endpoints (`/admin/api/me`, `/admin/api/login`) live on `extremedeptkidz.com`; calling them from the correct origin avoids CORS/credential issues.

### 2. Auth check (`checkAuthStatus`)

- Tries `GET /admin/api/me` first, then `GET /api/auth/user` if the first returns 404.
- Fallback is awaited correctly (no broken promise chain).
- Same `credentials: 'include'` and headers for both attempts.

### 3. Login

- **Endpoints:** Tries `POST /admin/api/login` first, then `POST /api/auth/login` on 404.
- **Body:** Sends only `{ email, password }` (no extra fields that might be rejected).
- **Email:** Normalized with `trim()` and `toLowerCase()` before sending.
- **Password:** Trimmed only (no case change).
- **Error handling:** Uses the API’s error message when present (e.g. “incorrect” or “Invalid email or password”).
- **Response handling:** Supports:
  - `{ user, token }`
  - `{ data: { user }, token }`
  - User object at top level
  - Token in `token` or `access_token`, with optional `Bearer ` prefix.

### 4. Logout

- Tries `POST /admin/api/logout` first, then `POST /api/auth/logout` on 404.
- Both calls are awaited; local state is cleared in `finally`.

### 5. Login page

- Passes trimmed, lowercased email into `login()`.
- Shows the exact error message from the API when login fails.

---

## If login still says “incorrect”

1. **Confirm credentials**
   - Email: `info@extremedeptkidz.com` (no spaces, lowercase).
   - Password: `Admin123!@#` (case- and symbol-sensitive).

2. **Confirm user in admin**
   - The same email/password must work in the main admin at `https://extremedeptkidz.com/admin`.
   - If it doesn’t work there, fix the user in the admin first.

3. **Check Network tab**
   - Open DevTools → Network.
   - Try to log in and find the login request (e.g. `login` or `admin/api/login`).
   - Check:
     - **Request URL** (should be `https://extremedeptkidz.com/admin/api/login` or fallback).
     - **Status** (401 = wrong credentials or not allowed; 422 = validation error).
     - **Response** body for the exact message (e.g. “incorrect”, “Invalid credentials”).

4. **CORS / credentials**
   - If the request fails before reaching the server (e.g. CORS error), the admin backend must allow:
     - Origin: `https://warehouse.extremedeptkidz.com`
     - Credentials: `true`
   - Otherwise the browser may block the request or omit cookies.

---

## Build status

- `npm run build` completes successfully.
- No linter errors in auth or login code.

Credentials are still **info@extremedeptkidz.com** / **Admin123!@#**; auth flow and API base URL are aligned with the admin panel for consistent, reliable login.
