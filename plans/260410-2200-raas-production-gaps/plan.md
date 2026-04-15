> **Plan Status:** ARCHIVED — Gaps addressed in a16z autonomy phases 1-3

# RaaS Production Gaps — Implementation Plan

## Source
Research: plans/reports/researcher-260410-raas-buyer-journey.md

## Status
| Phase | Description | Status | Group |
|-------|-------------|--------|-------|
| 16 | Onboarding Flow (signup→verify→activate) | pending | A |
| 17 | API Key Rotation + Management | pending | A |
| 18 | Feature Gate Enforcement | pending | A |
| 19 | Webhook Resilience (retry, idempotency) | pending | B |
| 20 | Revenue Analytics (cohort, churn, LTV) | pending | B |
| 21 | Self-Hosted Deployment Guide | pending | C (docs) |

Note: PostgreSQL migration (G4) deferred — current SQLite/JSON works for MVP launch. Migrate when >100 customers.

## Execution
1. Group A: Phases 16, 17, 18 parallel
2. Group B: Phases 19, 20 parallel (after A)
3. Group C: Phase 21 (docs only, after B)

## File Ownership
| Phase | Owns |
|-------|------|
| 16 | src/api/routes/onboarding-routes.ts, src/billing/onboarding-service.ts |
| 17 | src/api/routes/api-key-routes.ts, src/billing/api-key-manager.ts |
| 18 | src/middleware/feature-gate.ts |
| 19 | src/api/routes/webhooks/webhook-resilience.ts |
| 20 | src/billing/revenue-analytics.ts |
| 21 | docs/self-hosted-deployment.md |
