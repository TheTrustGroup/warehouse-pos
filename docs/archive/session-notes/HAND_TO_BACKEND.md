# Hand This to Your Backend / Server Person

**Goal:** So that **warehouse.extremedeptkidz.com** can log in without "Load failed", the server at **extremedeptkidz.com** must do two things.

---

## 1. Enable CORS for the warehouse domain

Allow the warehouse app origin and credentials.

- **Origin to allow:** `https://warehouse.extremedeptkidz.com`
- **Credentials:** `true`
- **Methods:** `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Headers:** `Content-Type`, `Accept`, `Authorization`

**Full instructions (Laravel, Node, Nginx, Vercel, Apache):**  
→ Open **`SERVER_SIDE_FIX_GUIDE.md`** in this repo and use the section that matches your stack.

---

## 2. Expose a login API the app can call

The warehouse app calls:

- **URL:** `POST https://extremedeptkidz.com/admin/api/login`
- **Body (JSON):** `{ "email": "user@example.com", "password": "..." }`
- **Response (JSON):** e.g. `{ "user": { ... }, "token": "..." }` or session cookie + user object

If your real login is at a different path (e.g. `/api/login`), either:

- Add a route that handles `POST /admin/api/login` and forwards to your existing login, or  
- Tell the frontend team the correct URL so they can update the app.

---

## 3. Test after changes

Run in terminal (from this project folder):

```bash
./test-cors-and-login.sh
```

Or manually:

```bash
# CORS preflight
curl -X OPTIONS "https://extremedeptkidz.com/admin/api/login" \
  -H "Origin: https://warehouse.extremedeptkidz.com" \
  -H "Access-Control-Request-Method: POST" \
  -v

# Login (expect 401/422 with JSON)
curl -X POST "https://extremedeptkidz.com/admin/api/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' \
  -v
```

---

**Files to share:**

- **SERVER_SIDE_FIX_GUIDE.md** – Full CORS and endpoint instructions
- **HAND_TO_BACKEND.md** – This one-page summary
