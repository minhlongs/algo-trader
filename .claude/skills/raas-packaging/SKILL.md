---
name: raas-packaging
description: "RaaS (Revenue as a Service) product packaging for algo-trader. Covers pricing tiers, Polar.sh integration, subscription management, customer onboarding, revenue tracking. Triggers: RaaS, pricing, Polar.sh, subscription, tier, Starter, Pro, Growth, Enterprise, customer onboarding, revenue tracking, license, billing, payment webhook, NOWPayments"
---

# RaaS Packaging Skill

## Purpose

Guide RaaS product packaging operations: tier configuration, subscription lifecycle, payment integration, customer onboarding, and revenue tracking for algo-trader's SaaS offering.

## Codebase Layout

```
src/gate/
  raas-gate.ts              # Feature gate by license tier
  tier-config.ts            # Tier definitions and limits
  validators.ts             # License validation
src/billing/
  subscription-service.ts   # Subscription lifecycle (provider-agnostic)
  payment-service.ts        # Payment processing
  license-service.ts        # License key generation/validation
  nowpayments-service.ts    # NOWPayments (crypto) integration
  coupon-service.ts         # Coupon management
  dunning-service.ts        # Failed payment recovery
  enterprise-onboarding-service.ts  # Enterprise customer onboarding
  onboarding-service.ts     # Customer onboarding flow
  invoice-generator.ts      # Invoice generation
  revenue-analytics.ts      # Revenue analytics
  metrics/revenue-metrics.ts # Revenue metrics
  usage-metering-service.ts # Usage tracking per tier
src/api/routes/webhooks/
  handlers/checkout-handler.ts   # Polar.sh checkout webhook
  handlers/payment-handler.ts    # Payment webhook
  handlers/subscription-handler.ts # Subscription webhook
  nowpayments-webhook.ts         # NOWPayments webhook
  webhook-resilience.ts          # Webhook retry/fallback
src/middleware/
  feature-gate.ts          # Feature access by tier
  license-validation.ts    # License check middleware
  usage-tracking-middleware.ts # Usage tracking
src/types/license.ts       # License type definitions
data/
  subscriptions.json       # Subscription store (dev)
  payments.json            # Payment records
  licenses.json            # License records
  coupons.json             # Coupon definitions
  activations.json         # License activations
```

## Pricing Tiers

| Tier | Price | Target | Key Limits |
|------|-------|--------|------------|
| Starter | $49/mo | Individual traders | Basic signals, 1 exchange |
| Pro | $149/mo | Active traders | All signals, 3 exchanges, paper trading |
| Growth | $399/mo | Professional | Live trading, API access, priority support |
| Enterprise | Custom | Funds/Teams | Dedicated infra, SLA, custom strategies |

**Tier config:** `src/gate/tier-config.ts` — defines feature limits per tier.

## License System

**Types** (`src/types/license.ts`):
```typescript
type LicenseTier = 'starter' | 'pro' | 'growth' | 'enterprise';
type LicenseStatus = 'active' | 'expired' | 'cancelled' | 'pending';
```

**License service** (`src/billing/license-service.ts`):
- Key generation: `generateLicenseKey()`
- Validation: `validateLicense(key)` → `{ valid, tier, expiresAt }`
- Activation: `activateLicense(key, deviceId)` → stores in `data/activations.json`

## Subscription Lifecycle

**States:** `pending | active | cancelled | expired`

**Flow:**
1. Customer selects tier → checkout (Polar.sh or NOWPayments)
2. Webhook received → `subscription-service.ts` creates subscription record
3. License generated/activated → feature gate enabled
4. Renewal → webhook updates `currentPeriodEnd`
5. Cancellation → status → `cancelled`, grace period applies
6. Expiry → status → `expired`, feature gate downgrades

## Payment Providers

### Polar.sh (Primary)
- Checkout: `POST /api/checkout` → Polar checkout URL
- Webhooks: `src/api/routes/webhooks/handlers/checkout-handler.ts`
- Events: `checkout.created`, `subscription.created`, `subscription.updated`, `subscription.cancelled`

### NOWPayments (Crypto backup)
- Service: `src/billing/nowpayments-service.ts`
- Webhook: `src/api/routes/webhooks/nowpayments-webhook.ts`
- Supports: BTC, ETH, USDT, etc.

## Feature Gating

**Middleware chain:**
1. `license-validation.ts` — verify active license
2. `feature-gate.ts` — check tier has access to feature
3. `usage-tracking-middleware.ts` — track API calls against tier limits

**RaaS gate** (`src/gate/raas-gate.ts`): Programmatic feature access check:
```typescript
raasGate.check(userTier, feature) → boolean
```

## Customer Onboarding

**Enterprise onboarding** (`src/billing/enterprise-onboarding-service.ts`):
- Inquiry → demo → contract → provisioning
- `enterprise-paper-demo-provisioner.ts` — auto-provisions demo environment
- `enterprise-tam-notifier.ts` — TAM (technical account manager) notification

**Self-serve onboarding** (`src/billing/onboarding-service.ts`):
- License activation → setup wizard → first signal

## Revenue Tracking

**Metrics** (`src/billing/metrics/revenue-metrics.ts`):
- MRR, ARR, churn rate, LTV, CAC
- Per-tier breakdown
- Revenue by source (Polar vs NOWPayments)

**Analytics** (`src/billing/revenue-analytics.ts`):
- Revenue trends, cohort analysis
- Payment method distribution

## Webhook Resilience

`src/api/routes/webhooks/webhook-resilience.ts`:
- Retry with exponential backoff
- Idempotency via event ID tracking
- Fallback to file store if DB unavailable

## Adding a New Tier

1. Add tier to `LicenseTier` in `src/types/license.ts`
2. Define limits in `src/gate/tier-config.ts`
3. Add pricing in `data/coupons.json` or Polar.sh dashboard
4. Update `feature-gate.ts` with new tier's feature matrix
5. Update onboarding flow if enterprise

## References

- `references/polar-sh-integration.md` — Polar.sh API and webhook details
- `references/subscription-lifecycle.md` — Full subscription state machine
- `references/onboarding-flows.md` — Self-serve and enterprise onboarding
