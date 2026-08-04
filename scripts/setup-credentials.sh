#!/usr/bin/env bash
# setup-credentials.sh — Configure Phase 01 secrets for GTM execution
# Usage: ./scripts/setup-credentials.sh
# REQUIRES: wrangler login done beforehand

set -euo pipefail

echo "=== CashClaw Credential Setup ==="
echo "This script will prompt for 8 secrets."
echo "Values go to Wrangler secrets / .env.local — NOT stored in git."
echo ""

echo "--- Wrangler Secrets (CF Workers) ---"

echo ""
read -s -p "1. NOWPAYMENTS_API_KEY: " np_key && echo ""
wrangler secret put NOWPAYMENTS_API_KEY --env production <<< "$np_key"

echo ""
read -s -p "2. NOWPAYMENTS_IPN_SECRET: " np_secret && echo ""
wrangler secret put NOWPAYMENTS_IPN_SECRET --env production <<< "$np_secret"

echo ""
read -s -p "3. NOWPAYMENTS_INVOICE_STARTER (optional test invoice ID): " np_invoice && echo ""
wrangler secret put NOWPAYMENTS_INVOICE_STARTER --env production <<< "$np_invoice"

echo ""
echo "--- .env.local (scripts + dashboard) ---"

ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M)"
fi

read -p "4. SENDGRID_API_KEY: " sg_key
read -p "5. SENDGRID_FROM_EMAIL: " sg_from
read -p "6. SENDGRID_FROM_NAME: " sg_name
read -p "7. ADMIN_EMAIL: " admin_email
read -p "8. TELEGRAM_BOT_TOKEN: " tg_token

cat > "$ENV_FILE" << EOF
SENDGRID_API_KEY=${sg_key}
SENDGRID_FROM_EMAIL=${sg_from}
SENDGRID_FROM_NAME=${sg_name}
ADMIN_EMAIL=${admin_email}
TELEGRAM_BOT_TOKEN=${tg_token}
EOF

echo ""
echo "=== Verification ==="
echo "Wrangler secrets (NOWPayments):"
wrangler secret list 2>&1 | grep -E "NOWPAYMENTS|INVOICE" || echo "  verify manually: wrangler secret list"
echo ""
echo ".env.local keys set:"
grep -cE "SENDGRID|ADMIN|TELEGRAM" "$ENV_FILE" || echo "0"
echo ""
echo "=== Next steps ==="
echo "  pnpm exec tsx scripts/send-email-campaign.ts --test"
echo "  curl -X POST https://api.cashclaw.cc/api/delivery/energy-9 -H 'Authorization: Bearer <jwt>'"
