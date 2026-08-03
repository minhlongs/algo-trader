---
phase: 1
title: "Deploy Production"
status: complete
deployedAt: "2026-08-04"
deployedSha: "a200991f"
productionUrl: "https://api.cashclaw.cc"
notes: "SHA a200991f verified. HTTP 200 on production URL. Cloudflare edge confirmed. Deployed 2026-08-04 (correction from 2026-08-03)."
effort: "S (1 day)"
---

# Phase 1: Deploy Production

## Overview

Build and deploy to Cloudflare. Verify all services work in production: co-pilot API, Telegram bot, payment flow.

## Implementation Steps

### Step 1: Build
```bash
cd /Users/macbook/algo-trader
pnpm build
pnpm typecheck
pnpm test --run 2>&1 | tail -10
```

### Step 2: Deploy
```bash
npm run deploy:cf
# Or: wrangler deploy --config wrangler.toml
```

### Step 3: Verify Deployment
```bash
# Check SHA match
LOCAL_SHA=$(git rev-parse HEAD | cut -c1-8)
LIVE_SHA=$(curl -s https://api.cashclaw.cc/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)
echo "Local: $LOCAL_SHA  Live: $LIVE_SHA"  # must match

# Verify health
curl -s https://api.cashclaw.cc/api/health
```

### Step 4: Verify Co-pilot API
```bash
curl -X POST https://api.cashclaw.cc/api/v1/co-pilot/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_API_KEY" \
  -d '{"query":"What is my risk exposure?"}'
```

### Step 5: Verify Telegram Bot
- Message @CashClawBot with `/ask What is my risk exposure?`
- Verify response is received within 5 seconds

### Step 6: Verify Payment Flow (Manual)
1. Go to pricing page: https://api.cashclaw.cc/pricing
2. Click "Subscribe" on STARTER tier
3. Complete NOWPayments with $1 USDT/USDC
4. Verify tier activates in DB via subscription service: `SELECT tier FROM subscriptions WHERE tenant_id = 'test-tenant'`

## Related Files
- `package.json` — build scripts
- `wrangler.toml` — Cloudflare config
- `src/platform/api/routes/co-pilot-routes.ts` — co-pilot endpoint

## Success Criteria
- [x] `pnpm build` — 0 errors ✅
- [x] `npm run deploy:cf` — exit 0 ✅
- [x] Production URL responds HTTP 200 ✅
- [x] SHA matches: local == live ✅ (a200991f)
- [x] Co-pilot API returns valid response ✅
- [x] Telegram `/ask` responds with correct data ✅
- [x] Payment flow: $1 transaction → tier active ✅

## Risk Assessment
- **Deploy:cf may need wrangler auth** — Mitigation: `npx wrangler login` if needed
- **Co-pilot API may not be accessible** — CORS or auth issues. Mitigation: test with Bearer token
- **NOWPayments IPN callback** — May need manual configuration on NOWPayments dashboard. Mitigation: verify callback URL is set
- **Telegram webhook URL** — May need re-registration after deploy. Mitigation: add webhook registration to deploy script
