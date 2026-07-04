---
phase: 3
title: "Configure IPN Webhook"
status: pending
priority: P1
effort: "~15min"
dependencies: [1]
---

# Phase 3: Configure IPN Webhook

## Overview

Set `NOWPAYMENTS_IPN_SECRET` in production and configure NOWPayments webhook URL. The IPN handler code already exists and is verified — missing only the production config. Currently logs warning on every startup: `NOWPAYMENTS_IPN_SECRET not configured`.

## Prerequisites

- Phase 1 complete (production deployed with latest code)
- Access to NOWPayments merchant dashboard
- `NOWPAYMENTS_IPN_SECRET` value from `.env` or password manager

## Related Code Files

- **Read:** `src/platform/billing/nowpayments-service.ts` — IPN verification logic (HMAC-SHA512)
- **Read:** `src/platform/workers/webhook-handlers.ts` — Worker IPN handler
- **Read:** `wrangler.toml` — Worker secrets config

## Implementation Steps

1. **Set wrangler secret:** `echo $NOWPAYMENTS_IPN_SECRET | wrangler secret put NOWPAYMENTS_IPN_SECRET`
2. **Set production env var** (if not CF-only): Add `NOWPAYMENTS_IPN_SECRET` to production environment
3. **Configure IPN URL in NOWPayments:**
   - Login to NOWPayments dashboard
   - Navigate to Settings → IPN
   - Set IPN URL: `https://algo-trader.example.com/api/v1/billing/ipn`
   - Set IPN secret to same value
4. **Verify:** Trigger test IPN from NOWPayments dashboard or run `pnpm vitest run src/platform/billing/` — IPN verification tests must pass
5. **Verify no warning:** Check production logs for `NOWPAYMENTS_IPN_SECRET not configured` — should not appear

## Success Criteria

- [ ] `NOWPAYMENTS_IPN_SECRET` set as wrangler secret
- [ ] NOWPayments IPN URL configured in merchant dashboard
- [ ] Test IPN returns HTTP 200 with HMAC verification passing
- [ ] No startup warning about missing IPN secret
- [ ] E2E payment flow works: invoice → IPN → tier activation
