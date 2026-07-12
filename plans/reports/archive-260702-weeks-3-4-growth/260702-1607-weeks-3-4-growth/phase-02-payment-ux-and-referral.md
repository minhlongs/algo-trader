---
phase: 2
title: "Payment UX and Referral"
status: pending
priority: P2
effort: "~4h"
dependencies: []
---

# Phase 2: Payment UX and Referral

## Overview

Improve marketplace subscribe flow (payment UX) and activate referral program (code already built).

## Payment UX (B1)

Current flow: click Subscribe → receive checkoutUrl → manual redirect. Kém UX.

### Improvements
- **Subscribe button** → loading state → redirect to NOWPayments checkout
- **Post-payment polling** — "I've paid" button that polls subscription status every 5s
- **Payment pending state** — show "Complete your payment" with link
- **Success state** — "Strategy activated! View execution results"
- **Error state** — "Payment failed. Try again or contact support"

### Related Files
- Modify: `dashboard/src/pages/marketplace-page.tsx`
- Modify: `dashboard/src/hooks/use-marketplace.ts`
- Read: `src/platform/api/routes/marketplace-subscription-routes.ts`

## Referral (A2)

Code đã build: CRUD, commission calculator, fraud detector, 11 tests. Cần activate.

### Related Files
- Read: `src/platform/referral/` — referral-crud.ts, commission-calculator.ts, fraud-detector.ts
- Read: `src/platform/api/routes/referral-routes.ts` — 5 endpoints
- Read: `dashboard/src/pages/referral-page.tsx` — referral page (built)
- DB: migration for referral tables (verify exists)

### Steps
1. Verify referral DB schema exists and migrations applied
2. Enable referral routes if feature-gated
3. Add referral CTA in dashboard after user subscribes
4. Test: generate code → share → track click → commission accrues

## Success Criteria

- [ ] Subscribe button shows loading → redirects to checkout
- [ ] "I've paid" button polls and detects activation
- [ ] Success/error/pending states render correctly
- [ ] Referral: POST /generate-code returns valid code
- [ ] Referral: POST /track-click increments counter
- [ ] Referral dashboard page shows stats
- [ ] `pnpm typecheck` — 0 errors
