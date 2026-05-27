# What to Do Next – Get Everything Working

This checklist is what **you** (or your backend person) need to do so the warehouse app and roles work in production.

---

## 1. Deploy the warehouse app (if you haven’t)

- Push your latest code to GitHub (from the `warehouse-pos` folder: `git push`).
- If you use **Vercel**: ensure the project is connected to the same repo and that deployments run on push. Trigger a deploy if needed.
- The live app should be at **https://warehouse.extremedeptkidz.com**.

---

## 2. Backend: CORS and auth (so login works)

Someone with access to **extremedeptkidz.com** (the server/backend) must:

1. **Allow CORS for the warehouse domain**
   - Origin: `https://warehouse.extremedeptkidz.com`
   - Credentials: `true`
   - Methods: GET, POST, PUT, DELETE, OPTIONS  
   - Headers: Content-Type, Accept, Authorization  
   → Details: **SERVER_SIDE_FIX_GUIDE.md** (pick Laravel, Node, Nginx, etc.).

2. **Expose (or keep) these auth endpoints**
   - `POST /admin/api/login` – body: `{ "email": "...", "password": "..." }`, response: user + token or session cookie.
   - `GET /admin/api/me` – returns the current user (including `role`) when logged in.

One-page summary to hand to backend: **HAND_TO_BACKEND.md**.

---

## 3. Backend: Create the role users (so employees can log in)

In your **main store admin** or user database (wherever you manage users for extremedeptkidz.com):

- **Admin:** Leave as you already have it (your current admin email and password).
- **Other roles:** Create one user per role with:

  | Role      | Email (login)                  | Password  |
  |-----------|--------------------------------|-----------|
  | Manager   | manager@extremedeptkidz.com    | EDK-!@#   |
  | Cashier   | cashier@extremedeptkidz.com    | EDK-!@#   |
  | Warehouse | warehouse@extremedeptkidz.com  | EDK-!@#   |
  | Driver    | driver@extremedeptkidz.com     | EDK-!@#   |
  | Viewer    | viewer@extremedeptkidz.com     | EDK-!@#   |

- Set each user’s **role** in the database to: `manager`, `cashier`, `warehouse`, `driver`, or `viewer` (same as the email prefix).
- When the warehouse app calls `GET /admin/api/me` after login, the API must return a **user object that includes `role`** (e.g. `"role": "manager"`). The app uses that to show/hide features.

If your backend uses different role names, either create users with the emails above and map those to your roles, or tell the frontend which role values the API returns so we can align.

---

## 4. Backend: Products (and optional orders) API

So that **Inventory** and **POS** show real data:

- **Products:** The app calls `GET /admin/api/products` (or `GET /api/products` if the first returns 404).  
  Response: JSON array of products. Each product should have at least: `id`, `name`, `sku`, `category` (string or `{ id, name, slug }`), `quantity`, `sellingPrice`, `costPrice`, `location` (object with `aisle`, `rack`, `bin`), `supplier` (object with `name`, `contact`, `email`).  
  → See **SERVER_SIDE_FIX_GUIDE.md** and **BACKEND_REQUIREMENTS.md** for full shape and CORS for this route.

- **Orders (optional):** If you use the Orders page, the app expects something like `GET /api/orders` (or your real orders endpoint). CORS must allow the warehouse origin for that URL as well.

---

## 5. Verify

1. Open **https://warehouse.extremedeptkidz.com** and log in with **admin** (your existing credentials). You should see Dashboard, Inventory, POS, etc.
2. Log out and log in with **manager@extremedeptkidz.com** / **EDK-!@#**. You should see the same nav but with manager permissions (no Users, etc.).
3. Log in with **viewer@extremedeptkidz.com** / **EDK-!@#**. You should see Dashboard, Inventory, POS, Reports (viewer permissions).
4. In **Settings → User Management**, the “Logins for other roles” table should match what you created in the backend; use it to copy credentials for staff.

---

## Quick reference

| Task                         | Who        | Where to look              |
|-----------------------------|------------|----------------------------|
| Deploy warehouse app        | You        | Vercel / hosting dashboard |
| CORS + login/me + products  | Backend    | SERVER_SIDE_FIX_GUIDE.md, HAND_TO_BACKEND.md |
| Create role users           | Backend    | This file (§3), ROLES_AND_ACCESS.md |
| Change what each role can do | Frontend   | warehouse-pos: `src/types/permissions.ts` |

If the backend is done first (CORS + login/me + role users), then once you deploy the app, login and role-based access will work. Products (and orders) can follow when those APIs are ready.
