# NEXT 1 — Sale Receipt Email

After a successful sale, if the customer provides an email at checkout, a receipt is sent via Resend.

## What was implemented

1. **Database:** `sales.customer_email` column; `record_sale` accepts 11th param `p_customer_email`.
2. **API:** POST /api/sales accepts `customerEmail` in the body and passes it to `record_sale`. After success, if `customerEmail` is set, the API invokes the Edge Function `send-receipt` (fire-and-forget).
3. **Edge Function:** `inventory-server/supabase/functions/send-receipt/index.ts` — loads sale + lines from DB, builds HTML receipt, sends via Resend. If sale has no `customer_email`, returns 200 without sending.
4. **POS:** CartSheet has an optional “Email receipt (optional)” field; value is sent as `customerEmail` in the sale payload.

## Deploy and secrets

1. **Run the migration** in both Supabase projects:
   - `inventory-server/supabase/migrations/20260305300000_sales_customer_email_and_receipt.sql`

2. **Install Supabase CLI** if needed (macOS: `brew install supabase/tap/supabase`; or use `npx supabase`).

3. **Deploy the Edge Function** from the directory that contains `supabase/functions` (i.e. `inventory-server`):
   ```bash
   cd warehouse-pos/inventory-server
   supabase functions deploy send-receipt
   ```
   Use the full path if you're not in the repo root, e.g.:
   `cd "/Users/.../World-Class Warehouse Inventory & Smart POS System/warehouse-pos/inventory-server"`.

4. **Set secrets** in Supabase Dashboard → Edge Functions → send-receipt → Secrets (or via CLI):
   - `RESEND_API_KEY` — required for sending (get from [resend.com/api-keys](https://resend.com/api-keys)).
   - Optional: `STORE_NAME` (default: "EXTREME DEPT KIDZ"), `RECEIPT_FROM_EMAIL` (default: "onboarding@resend.dev" for testing; use your verified domain for production).

5. **Resend:** For production, [verify your domain](https://resend.com/domains) and set `RECEIPT_FROM_EMAIL` to an address on that domain (e.g. `receipts@yourstore.com`).

## Local test

```bash
cd inventory-server
supabase functions serve send-receipt --no-verify-jwt --env-file .env.local
# .env.local: RESEND_API_KEY=re_xxx, SUPABASE_URL=..., SUPABASE_SERVICE_ROLE_KEY=...
# Then POST to http://localhost:54321/functions/v1/send-receipt with body: { "sale_id": "<uuid of a sale that has customer_email set>" }
```

## Behaviour

- No email provided at checkout → no receipt sent, no error.
- Email provided → after sale is recorded, API calls `send-receipt` with `sale_id`; function loads sale, checks `customer_email`; if present, sends HTML receipt and returns 200.
