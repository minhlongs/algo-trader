# Phase 05 — Strategy Prices + IPN Config

**Priority:** P0 | **Status:** pending | **Est:** 30min

## Goal

Ensure strategies have real prices and IPN webhook is configured for production.

## Steps

### 5.1 Set strategy prices

- [ ] Check current `priceUsdMonthly` values for all published strategies
- [ ] If 0 → set realistic prices (e.g., $49-$299/month based on strategy tier)
- [ ] Update via SQL: `UPDATE marketplace_listings SET price_usd_monthly = <cents> WHERE ...`
- [ ] Verify prices appear in dashboard

### 5.2 Configure IPN callback URL

- [ ] Verify `NOWPAYMENTS_IPN_URL` env var is set to `https://backend.cashclaw.cc/api/v1/webhooks/nowpayments`
- [ ] Verify URL is publicly accessible (not localhost)
- [ ] Check CF Tunnel routes webhook path correctly
- [ ] If missing → add to `.env` and Docker Compose

### 5.3 Verify NOWPayments API key

- [ ] Verify `NOWPAYMENTS_API_KEY` is set
- [ ] Verify `NOWPAYMENTS_IPN_SECRET` is set and matches NOWPayments dashboard
- [ ] Test HMAC signature verification with a real IPN payload

## Expected Output

Strategies have prices, webhook URL reachable from internet, API keys configured.

## Files

- `.env` or Docker Compose env vars
- `src/platform/billing/nowpayments-service.ts` (no changes, verify only)
