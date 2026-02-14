# POS & Admin Credentials

**Admin credentials remain unchanged.** Use the same admin login as always.

## Admin (unchanged)

| Purpose | Email | Password |
|--------|--------|----------|
| Admin / full access | `info@extremedeptkidz.com` | *(your existing admin password)* |

The server treats `info@extremedeptkidz.com` as admin (see `ALLOWED_ADMIN_EMAILS` or default in `inventory-server/lib/auth/roles.ts`). Admin password is not checked by the warehouse app (set in your main admin if needed).

---

## POS logins (per location)

**Only these passwords work** for the POS accounts; any other password is rejected to prevent theft.

| Location | Email | Password |
|----------|--------|----------|
| **Main Store / DC** | `cashier@extremedeptkidz.com` | `MEDk-1!@#` |
| **Main Town** | `maintown_cashier@extremedeptkidz.com` | `TEDk-2!@#` |

- The server enforces these passwords via env vars `POS_PASSWORD_CASHIER_MAIN_STORE` and `POS_PASSWORD_MAIN_TOWN`. Set them in **inventory-server** (e.g. Vercel env or `.env.local`). If unset, login for that POS account will fail.
- Run the seed script so `user_scopes` assigns each email to the correct store/warehouse: `inventory-server/supabase/scripts/seed_stores_warehouses_dc_maintown.sql`.
