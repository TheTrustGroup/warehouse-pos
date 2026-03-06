# NEXT 2 — Low Stock Alert

Daily email at 8:00 AM (UTC) to warehouse admins listing out-of-stock (qty=0) and low-stock (1≤qty≤3) products. Only sent when there is at least one such product and the warehouse has an alert email configured.

## What was implemented

1. **Database:** `warehouses.admin_email` (optional). When set, that address receives the daily alert for that warehouse.
2. **Edge Function:** `low-stock-alert` — loads all warehouses, for each fetches `warehouse_inventory` + product names, filters to qty=0 and 1≤qty≤3, builds HTML email, sends via Resend. Skips warehouses with no alerts or no email.
3. **Cron:** Migration `20260305320000_cron_low_stock_alert_8am.sql` schedules pg_cron at 8am to call the function via pg_net (requires Vault secrets). Alternative: use Dashboard Cron (see below).

## Deploy and configure

1. **Run migrations** (both Supabase projects):
   - `20260305310000_warehouses_admin_email.sql`
   - `20260305320000_cron_low_stock_alert_8am.sql` (optional if you use Dashboard Cron)

2. **Enable pg_net:** Dashboard → Database → Extensions → enable **pg_net**.

3. **Deploy the Edge Function:**
   ```bash
   cd warehouse-pos/inventory-server
   supabase functions deploy low-stock-alert
   ```

4. **Secrets for the function** (Dashboard → Edge Functions → low-stock-alert → Secrets):
   - `RESEND_API_KEY` — required (same as send-receipt).
   - Optional: `STORE_NAME`, `LOW_STOCK_FROM_EMAIL`, `LOW_STOCK_THRESHOLD` (default 3), `INVENTORY_PAGE_URL` (for “Log in to restock” link), `LOW_STOCK_ALERT_EMAIL` (fallback when a warehouse has no `admin_email`), `CRON_SECRET` (optional; if set, cron must send `Authorization: Bearer <CRON_SECRET>`. Use same value as Vault secret `cron_secret` when using pg_cron.)

5. **Set warehouse admin emails:** For each warehouse that should receive alerts, set `admin_email`:
   ```sql
   UPDATE warehouses SET admin_email = 'admin@yourstore.com' WHERE id = '<warehouse_id>';
   ```
   Or use a single fallback by setting the `LOW_STOCK_ALERT_EMAIL` secret; then every warehouse with at least one alert uses that address if `admin_email` is null.

## Scheduling (pick one)

### Option A — pg_cron + pg_net (migration)

1. **Vault:** Store the project URL and a key so the cron job can call the function.
   - Dashboard → Project Settings → Vault (or SQL Editor):
   ```sql
   SELECT vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
   -- Either: same value as Edge Function secret CRON_SECRET (recommended)
   SELECT vault.create_secret('your-random-cron-secret', 'cron_secret');
   -- Or: use service role or anon key for Authorization
   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
   ```
   If you use `cron_secret`, set the Edge Function secret `CRON_SECRET` to the same value.
2. Run migration `20260305320000_cron_low_stock_alert_8am.sql` (if not already applied).
3. Job runs daily at 8:00 AM UTC.

### Option B — Dashboard Cron (no Vault)

1. Do **not** rely on the cron migration (you can run the other migrations only).
2. Dashboard → Edge Functions → **low-stock-alert** → **Cron** (or **Schedule**).
3. Add trigger: schedule `0 8 * * *` (8am UTC).
4. If you set `CRON_SECRET`, configure the scheduled invocation to send header `Authorization: Bearer <CRON_SECRET>` (if the UI allows custom headers; otherwise leave `CRON_SECRET` unset for this path).

## Behaviour

- **Out of stock:** `warehouse_inventory.quantity = 0`.
- **Low stock:** `warehouse_inventory.quantity` between 1 and `LOW_STOCK_THRESHOLD` (default 3).
- One email per warehouse that has at least one out-of-stock or low-stock product and a recipient (`admin_email` or `LOW_STOCK_ALERT_EMAIL`).
- No email is sent when there are no alerts or no recipient.
