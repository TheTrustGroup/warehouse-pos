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
ALLOWED_ADMIN_EMAILS=you@extremedeptkidz.com,admin@extremedeptkidz.com
```

If you don’t set this, **no one** gets admin from the backend.

## 3. Set Supabase (and optional CORS)

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Optionally set `CORS_ORIGINS` or `FRONTEND_ORIGIN` if your frontend is on a different origin.

## 4. Vercel (or other host)

In the project’s environment variables, add:

| Name                  | Value                                      | Notes                    |
|-----------------------|--------------------------------------------|--------------------------|
| `SESSION_SECRET`      | Output of `openssl rand -hex 24`           | Required in production   |
| `ALLOWED_ADMIN_EMAILS`| Your admin email(s), comma-separated        | Required for admin role |

Redeploy after changing env vars.
