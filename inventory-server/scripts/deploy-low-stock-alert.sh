#!/usr/bin/env bash
# Deploy low-stock-alert Edge Function and remind about secrets/schedule.
# Run from: warehouse-pos/inventory-server (or pass SUPABASE_PROJECT_REF if needed).

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

echo "Deploying low-stock-alert Edge Function..."
if command -v supabase &>/dev/null; then
  supabase functions deploy low-stock-alert
else
  echo "Supabase CLI not found. Run: npx supabase functions deploy low-stock-alert"
  npx supabase functions deploy low-stock-alert
fi

echo ""
echo "Next steps (manual):"
echo "1. Set Edge Function secrets (Dashboard → Edge Functions → low-stock-alert → Secrets):"
echo "   - RESEND_API_KEY (required)"
echo "   - CRON_SECRET (optional; same value as Vault cron_secret if using pg_cron)"
echo "   - LOW_STOCK_ALERT_EMAIL (optional fallback when warehouse has no admin_email)"
echo "2. Set recipient(s): run docs/scripts/set-warehouse-admin-email.sql or update warehouses.admin_email in SQL."
echo "3. Schedule: Option A) Add Vault secrets (project_url, cron_secret) and ensure cron migration ran. Option B) Dashboard → low-stock-alert → Cron → 0 8 * * *"
