---
status: complete
priority: P0
completed: 2026-07-12
testResults: 7/7 (webhook-http-e2e) + 5/5 (nowpayments-ipn-e2e) + 14/14 (billing-e2e)
---

# Phase 4: End-to-End Signup → Pay → Activate Validation — COMPLETE

## Context
After Phases 1-3 are complete, run a full integration test of the customer journey: landing page → signup → NOWPayments payment → IPN webhook → tier activation → Telegram welcome → dashboard access.

## Prerequisites
- Phase 1: Webhook mounted (POST /api/webhooks/nowpayments returns 200)
- Phase 2: api.cashclaw.cc publicly routable
- Phase 3: Telegram bot commands working
- NOWPayments sandbox/test API key configured

## Implementation Steps

1. **Landing → Signup flow**
   - Visit cashclaw.cc
   - Click signup/pricing
   - Verify registration form works
   - Confirm account creation in DB

2. **Signup → Payment flow**
   - Select PRO tier ($99/mo or test amount)
   - Verify NOWPayments checkout page loads
   - Complete sandbox/test payment
   - Verify redirect back to platform

3. **Payment → IPN → Tier activation**
   - Verify NOWPayments sends IPN to mounted webhook
   - Verify webhook authenticates (HMAC-SHA512)
   - Verify tier upgrades from FREE → PRO in DB
   - Verify license key generated/activated

4. **Activate → Dashboard access**
   - Login with new account
   - Verify tier-gated features unlocked (signal feed, backtest, etc.)
   - Verify API key generation works

5. **Activate → Telegram welcome**
   - Verify welcome message sent to Telegram
   - Verify `/link` connects Telegram to account
   - Verify `/results` shows account's signals

## Success Criteria
- Full chain completes without manual intervention
- All 5 steps above pass
- Any failure point logged with specific error for next-phase fix

## Rollback
- If sandbox payment fails: use NOWPayments test mode, do NOT use real funds
- If tier activation stuck: manual DB update via Prisma Studio, then debug webhook
- Block on: no real customer traffic until this flow is verified
