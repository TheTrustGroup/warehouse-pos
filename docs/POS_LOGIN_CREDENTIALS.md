# POS Login Credentials

POS logins for the two cashier accounts are validated **on the server** against environment variables. The app does **not** store these passwords in the database.

**Warehouse binding:** The server binds each POS email to a warehouse (Main Store / Main Town) and returns `user.warehouseId` in the login response. The POS UI then **skips the "Select warehouse to start" screen** and opens that warehouse’s POS directly. Super admin logins are not bound, so they still see the warehouse selector.

## Why "Invalid email or password" appears

The API (`/api/auth/login` or `/admin/api/login`) checks:

1. **Email** is one of the POS accounts below.
2. **Password** must exactly match the value of the corresponding **env var** on the server (where `inventory-server` runs, e.g. Vercel).

If the env var is **missing** or the value **does not match** what you type, the server returns `401` with `"Invalid email or password"`.

---

## Required environment variables (server only)

Set these where your **inventory-server** runs (e.g. Vercel → Project → Settings → Environment Variables):

| Email | Environment variable name | Example |
|-------|---------------------------|--------|
| `cashier@extremedeptkidz.com` | `POS_PASSWORD_CASHIER_MAIN_STORE` | Your chosen password (e.g. `MySecurePOS123`) |
| `maintown_cashier@extremedeptkidz.com` | `POS_PASSWORD_MAIN_TOWN` | Your chosen password |

- **No spaces** before/after the value in the env (or type the same when logging in).
- **Case-sensitive:** the password you type must match the env value exactly.
- If the variable is **not set**, login for that email will **always** fail with "Invalid email or password".

---

## Checklist if POS login says "incorrect"

1. **Where does the API run?** (e.g. Vercel project for inventory-server.)
2. In that project’s **Environment Variables**:
   - For **Main Store cashier:** `POS_PASSWORD_CASHIER_MAIN_STORE` = the password you want.
   - For **Main Town cashier:** `POS_PASSWORD_MAIN_TOWN` = the password you want.
3. **Redeploy** the API after changing env vars (Vercel redeploys on save; if you use another host, restart the server).
4. Try logging in again with:
   - Email: `cashier@extremedeptkidz.com` or `maintown_cashier@extremedeptkidz.com`
   - Password: **exactly** what you set in the env (no extra spaces).

---

## Local development

For local `inventory-server`, create or edit `.env` or `.env.local` in the **inventory-server** folder:

```bash
POS_PASSWORD_CASHIER_MAIN_STORE=YourMainStorePassword
POS_PASSWORD_MAIN_TOWN=YourMainTownPassword
```

Restart `npm run dev` after changing `.env`.

---

**Note:** The audit did not change login or password logic. If it worked before and now says incorrect, the most likely cause is that the env vars are missing or different on the current deployment (e.g. after a new deploy or a different environment).
