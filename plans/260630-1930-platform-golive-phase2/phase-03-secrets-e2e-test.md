# Phase 03 — Set Secrets + E2E Payment Test

**Status:** done | **Priority:** P0 | **Est.:** 20min

## Context

Set NOWPAYMENTS_IPN_SECRET trên worker, test end-to-end payment flow.

## Implementation Steps

1. Set secret:
   ```bash
   npx wrangler secret put NOWPAYMENTS_IPN_SECRET --name algo-trader
   ```

2. Configure NOWPayments IPN URL in dashboard:
   - URL: `https://api.cashclaw.cc/api/webhooks/nowpayments`
   - Secret: same as NOWPAYMENTS_IPN_SECRET

3. E2E test flow:
   a. Landing page → enter LAUNCH20 coupon → click Get Starter
   b. Complete test payment ($1 or minimum)
   c. Verify IPN received (check KV: `ipn-log:*`)
   d. Verify activation stored (check KV: `activation:{email}`)
   e. Verify coupon use count incremented

4. If NOWPayments test mode not available: test with curl simulating IPN payload

## Todo

- [ ] Set NOWPAYMENTS_IPN_SECRET wrangler secret
- [ ] Configure IPN URL in NOWPayments dashboard
- [ ] Test payment flow end-to-end
- [ ] Verify KV activation entry
- [ ] Verify IPN log entry
- [ ] Document test result
