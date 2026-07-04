---
phase: 2
title: "Customer Onboarding API & Triggers"
status: pending
priority: P1
dependencies: []
---

# Phase 2: Customer Onboarding API & Triggers

## Overview

Build the missing API bridge from pricing page → NOWPayments checkout. Wire the existing onboarding service and trial-drip to signup events. Fix dunning persistence. Add migration rollback capability.

**Red-team findings applied:** `POST /api/v1/nowpayments/invoice` doesn't exist — must create it. Better Auth signup hook doesn't exist — must add it. Dunning records are in-memory — must persist them. Trial-drip has no trigger. Existing `onboarding-service.ts` handles most of this already — work with it, not around it.

## Requirements

- Create `POST /api/v1/nowpayments/invoice` endpoint — pricing page CTA calls this to generate checkout URL
- Add Better Auth afterSignup hook — triggers trial-drip registration on signup
- Wire `trial-drip-service.processDueEmails()` to a trigger mechanism (cron or event)
- Persist dunning records in PostgreSQL (migration 042)
- Document landing server ↔ API server integration strategy (reverse proxy or unified)
- Add startup health check for SENDGRID_API_KEY

## Related Code Files

- Create: `src/platform/api/routes/nowpayments-api-routes.ts` — POST /api/v1/nowpayments/invoice
- Create: `src/shared/db/migrations/042-add-dunning-state.ts` — dunning persistence table
- Create: `scripts/rollback-migration.sh` — migration rollback script
- Modify: `src/platform/auth/auth-server.ts` — add afterSignup hook
- Modify: `src/platform/billing/dunning-service.ts` — replace Map with DB-backed storage
- Modify: `src/platform/landing/landing-server.ts` — add /api proxy or CORS config
- Modify: `src/platform/notifications/email-service.ts` — add startup health check
- Read: `src/platform/billing/onboarding-service.ts` — existing onboarding flow (don't duplicate)
- Read: `src/platform/api/server.ts` — register new routes
- Read: `src/platform/billing/trial-drip-service.ts` — existing service
- Read: `src/platform/api/routes/webhooks/nowpayments-webhook.ts` — existing IPN handler

## Implementation Steps

1. **Audit existing onboarding**: Read `onboarding-service.ts` — it already handles signup, email verification, license activation, and welcome-email drip registration
2. **Create invoice endpoint**: `POST /api/v1/nowpayments/invoice` — takes tier param, calls NOWPayments API, returns checkout URL
3. **Add signup hook**: Configure Better Auth `databaseHooks` or middleware to call `trialDripService.subscribe()` on user creation
4. **Wire trial-drip trigger**: Either (a) cron-based (pm2/Inngest calling GET /api/v1/trial-drip/process), or (b) event-driven (better-auth hook calls processDueEmails directly)
5. **Persist dunning**: Migration 042 adds `dunning_state` table. Refactor DunningService from Map → DB queries.
6. **Migration rollback**: Create `scripts/rollback-migration.sh <N>` that calls `down()` on migrations >= N
7. **Landing→API integration**: Option A (reverse proxy — landing server proxies /api/*), Option B (CORS config on API server for landing origin), Option C (checkout CTA is direct link to NOWPayments, not API call). Pick one based on deployment architecture.
8. **Email health check**: Add startup check for SENDGRID_API_KEY — fail loudly if missing in production

## API Contract: POST /api/v1/nowpayments/invoice

```json
POST /api/v1/nowpayments/invoice
Body: { "tier": "PRO" }
Response: { "invoiceId": "string", "checkoutUrl": "https://..." }
Errors: 400 (invalid tier), 502 (NOWPayments unavailable)
```

## Success Criteria

- [ ] `POST /api/v1/nowpayments/invoice` returns checkout URL for PRO/ENTERPRISE/MASTER tiers
- [ ] Better Auth signup triggers `trialDripService.subscribe()` — verified with test signup
- [ ] `trial-drip-service.processDueEmails()` sends emails when triggered (requires SENDGRID_API_KEY)
- [ ] Dunning records persist across restarts (migration 042 applied, Map removed)
- [ ] `scripts/rollback-migration.sh 42` reverts migration 042 successfully
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798+ passing

## Risk Assessment

- LOW: No money at risk. Missing SENDGRID_API_KEY causes loud failure at startup.
- MEDIUM: Migration 042 runs after previous migrations 039-041. Must test rollback path.
