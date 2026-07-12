# Phase A: Revenue Engine — $1M ARR Path

**Effort:** M (2-4 weeks core; stretch adds 3-4 weeks)
**Parallel-safe:** Yes (files isolated from other tracks)
**Impact:** Highest — directly generates first dollar

## Context

From the brainstorm: *"After 3 months of build, billing persistence is complete but the activation path is silently broken. The platform has never collected a single dollar."*

## Files to Modify

```
src/platform/billing/
├── tier-pricing.ts            — Add starter tier, annual prepay pricing
├── nowpayments-service.ts     — Fix IPN callback auto-configuration
├── invoice-generator.ts       — Handle new tiers
├── subscription-service.ts    — Annual vs monthly billing support
├── dunning-service.ts         — Updated for new tiers
vendor/paddle/
└── paddle-integration.ts      — NEW: Stripe/Paddle fiat billing (stretch)
src/platform/api/routes/
├── billing-routes.ts          — New tier selection, annual prepay endpoints
├── subscription-routes.ts     — Handle tier changes cleanly
src/platform/landing/public/
├── pricing.html               — Updated with Starter tier + annual options
├── signup.html                — Tier selection with annual toggle
src/platform/middleware/
└── feature-gate.ts            — Add Starter to tier config
src/shared/config/
└── tiers.ts                   — Starter tier definition
src/shared/types/
└── license.ts                 — LicenseTier enum (already has FREE/PRO/ENTERPRISE/MASTER)
src/platform/db/
└── migrations/                — NEW migration for Starter tier if needed
```

## Implementation Steps

### Step 1: Fix NOWPayments IPN Callback (Days 1-3)
**Priority: P0 — Without this, Track A generates zero revenue.**

1. Read `src/platform/billing/nowpayments-service.ts` and verify IPN callback registration
2. Ensure `config/nowpayments.ts` has `callback_url` pointing to live endpoint
3. Add `ipn_callback_url` auto-registration on service startup
4. Verify HMAC-SHA512 enforcement (already exists per changelog — verify end-to-end)
5. Test with a real $1 crypto transaction:
   - Send $1 USDT/USDC to NOWPayments wallet
   - Wait for IPN callback
   - Verify tier activates in DB (`subscriptions.status = 'active'`)
6. Add test: `nowpayments-ipn-e2e.test.ts` that simulates IPN callback

**Acceptance:** Real $1 transaction → tier activated in DB. Test this manually.

### Step 2: Add Starter Tier ($19-29/mo) (Days 4-6)
1. Add `STARTER` to `LicenseTier` enum in `src/shared/types/license.ts`
2. Add `STARTER` config in `src/shared/config/tiers.ts`:
   - Rate limit: 100 RPM, 10K daily API calls
   - Strategies: 3 concurrent
   - Markets: Polymarket + 1 CEX
   - Price: $19-$29/mo
3. Add `STARTER` to NOWPayments tier mapping in `src/platform/billing/nowpayments-service.ts`
4. Update `requireTier` middleware to handle STARTER
5. Update `feature-gate.ts` if needed
6. Update `pricing.html` with Starter tier card between FREE and PRO

### Step 3: Annual Prepay Plans at 15-20% Discount (Days 7-10)
1. Add `billing_interval` field to subscription schema: `monthly | annual`
2. Update `subscription-service.ts`:
   - `createSubscription(tier, interval)` — annual = price * 12 * 0.8-0.85
   - `renewSubscription()` — respect interval
   - `upgradeSubscription()` — prorate based on interval
3. Update `pricing.html` — add monthly/annual toggle
4. Update checkout flow — interval selection in URL params
5. Test: create annual subscription, verify price = 10 months value, verify renewal after 12 months

### Step 4: Stripe/Paddle Fiat Billing (Stretch — 3-4 weeks)
If Track A is producing cash and manual crypto repay shows 40%+ churn:
1. Set up Stripe/Paddle merchant account
2. Integrate `vendor/paddle/paddle-integration.ts` or Stripe SDK
3. Create webhooks for subscription lifecycle
4. Sync fiat subscriptions with internal tier system
5. Offer dual payment: "Crypto (Instant)" and "Card (Monthly)"

## Related Files
- `src/platform/billing/nowpayments-service.ts`
- `src/platform/billing/subscription-service.ts`
- `src/platform/billing/invoice-generator.ts`
- `src/platform/billing/dunning-service.ts`
- `src/shared/config/tiers.ts`
- `src/shared/types/license.ts`
- `src/platform/middleware/feature-gate.ts`
- `src/platform/landing/public/pricing.html`
- `src/platform/landing/public/signup.html`
- `src/platform/db/migrations/`

## Todo List
- [ ] Fix NOWPayments IPN callback auto-configuration
- [ ] Add STARTER tier ($19-29/mo)
- [ ] Add annual prepay plans at 15-20% discount
- [ ] Update pricing page with new tiers
- [ ] Update signup flow with interval selector
- [ ] End-to-end test: purchase → IPN → tier activation
- [ ] Verify dunning and trial drip work with new tiers
- [ ] [STRETCH] Integrate Stripe/Paddle fiat billing

## Success Criteria
- [ ] First $1 in revenue from paying subscriber (tier active in DB)
- [ ] NOWPayments IPN callback verified end-to-end with real $1 transaction
- [ ] Annual prepay checkout working — 12-month subscription at 20% discount
- [ ] Starter tier purchasable and activating correctly
- [ ] No regressions in Setup Wizard, Telegram bot, or Payment Flow

## Risk Assessment
- **NOWPayments API changes** could break IPN flow — test with real $1 transaction
- **Dual payment path confusion** — clearly label "Crypto (Instant)" vs "Card (Monthly)"
- **Stripe/Paddle integration** often hits Large due to tax compliance, refunds — descope if >1 sprint
- **Starter tier cannibalizes PRO** — price at 33% of PRO to maintain upgrade incentive
