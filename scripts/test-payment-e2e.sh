#!/usr/bin/env bash
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
STAGING_URL="${STAGING_URL:-https://algo-trader-staging.workers.dev}"
NP_API="${NP_API:-https://api-test.nowpayments.io/v1}"
NP_KEY="${NP_KEY:?Set NP_KEY (sandbox API key)}"
NP_IPN_SECRET="${NP_IPN_SECRET:?Set NP_IPN_SECRET (sandbox IPN secret)}"
EMAIL="e2e-test-$(date +%s)@test.local"
TIER="PRO"

echo "=== Staging Payment E2E ==="
echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. Create invoice via sandbox API
echo "→ Creating NOWPayments sandbox invoice..."
INVOICE_RESP=$(curl -s -X POST "$NP_API/invoice" \
  -H "Authorization: Bearer $NP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "price_amount": 99,
    "price_currency": "USD",
    "order_id": "e2e-'$(date +%s)'",
    "order_description": "E2E PRO tier test",
    "customer_email": "'"$EMAIL"'"
  }')
INVOICE_ID=$(echo "$INVOICE_RESP" | jq -r '.id // empty')
if [ -z "$INVOICE_ID" ]; then
  echo "FAIL: Invoice creation failed: $INVOICE_RESP"
  exit 1
fi
echo "✓ Invoice created: $INVOICE_ID"

# 2. Trigger sandbox payment completion
echo "→ Triggering sandbox payment..."
PAY_RESP=$(curl -s -X POST "$NP_API/invoice/$INVOICE_ID/payment" \
  -H "Authorization: Bearer $NP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payment_status": "finished"}')
echo "Payment response: $PAY_RESP"
echo "✓ Payment triggered"

# 3. Wait for IPN delivery (handler processes webhook)
echo "→ Waiting for IPN delivery (15s)..."
sleep 15

# 4. Verify subscription created in staging
echo "→ Checking subscription..."
SUB_RESP=$(curl -s "$STAGING_URL/api/v1/subscriptions?email=$EMAIL")
SUB_ID=$(echo "$SUB_RESP" | jq -r '.[0].id // empty')
if [ -z "$SUB_ID" ]; then
  echo "FAIL: No subscription found for $EMAIL"
  echo "Response: $SUB_RESP"
  exit 1
fi
echo "✓ Subscription found: $SUB_ID"

# 5. Verify subscription is active
STATUS=$(echo "$SUB_RESP" | jq -r '.[0].status // empty')
if [ "$STATUS" != "active" ]; then
  echo "FAIL: Subscription status is '$STATUS', expected 'active'"
  exit 1
fi
echo "✓ Subscription status: active"

# 6. Verify tier
TIER_VAL=$(echo "$SUB_RESP" | jq -r '.[0].tier // empty')
if [ "$TIER_VAL" != "$TIER" ]; then
  echo "FAIL: Tier is '$TIER_VAL', expected '$TIER'"
  exit 1
fi
echo "✓ Tier: $TIER"

echo "=== E2E PASS ==="
exit 0
