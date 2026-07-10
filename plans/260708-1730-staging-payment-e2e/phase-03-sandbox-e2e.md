---
title: Phase 3 — Sandbox E2E Test Execution
status: pending
priority: P1
phase: 3
dependsOn: [phase-01, phase-02]
---

# Phase 3: Sandbox E2E Test

## Overview

Execute the full payment chain in staging: create sandbox invoice → complete payment → receive IPN webhook → verify subscription + license created.

## Key Insights

- NOWPayments sandbox allows instant payment (no real crypto, no waiting for confirmations)
- The script operates from outside CF Worker — calls NOWPayments sandbox API directly, then polls staging for results
- IPN webhook fires automatically in sandbox mode when payment reaches `finished` state
- The production handler code is what gets tested — no code changes needed

## Requirements

1. Staging worker deployed and healthy (Phase 2 complete)
2. NOWPayments sandbox credentials (Phase 1 complete)
3. Staging worker URL from `wrangler.toml` (`algo-trader-staging.workers.dev`)
4. Node.js `fetch` available (Node 18+, uses native `fetch`)

## Steps

### 1. Create E2E Test Script

Write `scripts/test-payment-e2e.sh` (or `.mjs`):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Config
STAGING_URL=${STAGING_URL:-"https://algo-trader-staging.workers.dev"}
NP_API=${NP_API:-"https://api-test.nowpayments.io/v1"}
NP_KEY=${NP_KEY:?Set NP_KEY (sandbox API key)}
NP_IPN_SECRET=${NP_IPN_SECRET:?Set NP_IPN_SECRET (sandbox IPN secret)}
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
# Sandbox provides a test endpoint to simulate payment
echo "→ Triggering sandbox payment..."
PAY_RESP=$(curl -s -X POST "$NP_API/invoice/$INVOICE_ID/payment" \
  -H "Authorization: Bearer $NP_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payment_status": "finished"}')
echo "✓ Payment triggered: $PAY_RESP"

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

# 6. Verify license linked
LICENSE_ID=$(echo "$SUB_RESP" | jq -r '.[0].licenseId // empty')
if [ -z "$LICENSE_ID" ]; then
  echo "FAIL: No license linked to subscription"
  exit 1
fi
echo "✓ License linked: $LICENSE_ID"

# 7. Verify tier
TIER_VAL=$(echo "$SUB_RESP" | jq -r '.[0].tier // empty')
if [ "$TIER_VAL" != "$TIER" ]; then
  echo "FAIL: Tier is '$TIER_VAL', expected '$TIER'"
  exit 1
fi
echo "✓ Tier: $TIER"

echo "=== E2E PASS ==="
exit 0
```

### 2. Run Script

```bash
# Export sandbox credentials (from Phase 1)
export NP_KEY="<test-api-key>"
export NP_IPN_SECRET="<test-ipn-secret>"
export STAGING_URL="https://algo-trader-staging.workers.dev"

# Execute
chmod +x scripts/test-payment-e2e.sh
./scripts/test-payment-e2e.sh
```

### 3. Troubleshooting

| Issue | Fix |
|---|---|
| IPN not received | Check `NOWPAYMENTS_IPN_URL` points to staging worker, not localhost |
| Signature mismatch | Test IPN secret vs production secret — verify correct secret in `wrangler secret put` |
| Subscription not created | Check staging worker logs: `wrangler tail --env staging` |
| Script fails at invoice creation | Verify sandbox API key has invoice creation permission |

## Files Created

| File | Purpose |
|---|---|
| `scripts/test-payment-e2e.sh` | Autonomous E2E validation script |

## Files Touched

None in source code.

## Success Criteria

- [ ] Script exits 0 with all 7 checks passing
- [ ] No manual intervention needed during execution
- [ ] Subscription visible in staging with active status
- [ ] License created and bidirectional link confirmed
