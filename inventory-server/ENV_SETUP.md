# Environment setup (inventory-server)

## 1. Copy the example env

```bash
cp .env.local.example .env.local
```

## 2. Set RBAC variables

### SESSION_SECRET

- **Production:** Generate a random secret (min 16 characters). Example:
  ```bash
  openssl rand -hex 24
  ```
  Paste the output into `SESSION_SECRET` in `.env.local`. Never commit this file.

- **Local dev:** If you leave it empty, the app uses a default dev secret (not safe for production).

### ALLOWED_ADMIN_EMAILS

- Comma-separated list of emails that get **admin** role. Everyone else gets their role from the email prefix (e.g. `cashier@extremedeptkidz.com` → cashier).

Example:

```env
ALLOWED_ADMIN_EMAILS=info@extremedeptkidz.com
```

If you don’t set this, **`info@extremedeptkidz.com`** is still treated as admin by default so admin credentials remain unchanged.

### POS passwords (required for POS login)

Only the configured passwords work for the two POS accounts; any other password is rejected.

```env
POS_PASSWORD_CASHIER_MAIN_STORE=MEDk-1!@#
POS_PASSWORD_MAIN_TOWN=TEDk-2!@#
```

- **Main Store/DC:** `cashier@extremedeptkidz.com` → password must match `POS_PASSWORD_CASHIER_MAIN_STORE`.
- **Main Town:** `maintown_cashier@extremedeptkidz.com` → password must match `POS_PASSWORD_MAIN_TOWN`.

If either is unset, login for that POS account will fail with “Invalid email or password”.

## 3. Set Supabase (and optional CORS)

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Optionally set `CORS_ORIGINS` or `FRONTEND_ORIGIN` if your frontend is on a different origin.

## 4. Vercel (or other host)

In the project’s environment variables, add:

| Name                             | Value                                      | Notes                    |
|----------------------------------|--------------------------------------------|--------------------------|
| `SESSION_SECRET`                 | Output of `openssl rand -hex 24`           | Required in production  |
| `ALLOWED_ADMIN_EMAILS`           | Your admin email(s), comma-separated       | Required for admin role |
| `POS_PASSWORD_CASHIER_MAIN_STORE`| Password for cashier@… (Main Store/DC)     | Required for POS login  |
| `POS_PASSWORD_MAIN_TOWN`         | Password for maintown_cashier@… (Main Town)| Required for POS login  |

Redeploy after changing env vars.
