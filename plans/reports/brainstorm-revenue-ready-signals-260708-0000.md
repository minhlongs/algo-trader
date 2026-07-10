# Brainstorm: Revenue-Ready Signals API — Remaining 3 Items

**Date:** 2026-07-08 | **Mode:** serial implementation

## Problem Statement

Signals API Marketplace ideation ('260705-0025') defined Phase 0 goal: ship revenue-ready API. Prior session completed D1 migration, IPN→license fix, dead code cleanup, $49→$99 pricing. Three items remain unsolved: route duplication, missing OpenAPI spec, unresolved usage metering.

## Remaining Work Summary

| Item | Current State | Target |
|------|--------------|--------|
| Route consolidation | 3 routers duplicate auth/tier logic, 2 D1 subscription services | 1 canonical + shared helpers |
| OpenAPI 3.1 spec | Zero swagger/openapi infra | Static markdown + JSON spec file |
| Usage metering + dogfood billing | UsageMeteringService exists but never wired to Express | Middleware + dogfood endpoints |

## Chosen Approach

### Route Consolidation → Option C (Canonical + shared tier resolver)
- `signals-api-routes.ts` is already D1-backed and active → promotion to canonical
- Extract `resolveTier(req)` into `platform/middleware/signal-tier-resolver.ts`
- Extract `requireSignalTier()` middleware guard
- `signal-subscription-routes.ts` → thin wrapper redirecting to canonical paths OR direct removal after verifying all callers migrated
- Delete the older `signals-api/subscription-service-d1.ts` DTO/validator chain (keep `signalSubscriberRepo` from `signals-api-routes.ts`)
- Backward compat: zero breaking changes — paths stay same

### OpenAPI 3.1 Spec → Option B (Static spec files)
- `docs/api-reference-v2.md` — human-readable markdown with endpoint table, request/response examples, auth, rate limits, tier matrix
- `docs/openapi-signals-api.json` — raw OpenAPI 3.1 JSON for machine consumers
- No runtime dependency; serve via static Route if later needed

### Usage Metering + Dogfood Billing → Option A (Middleware + dogfood endpoint)
- `platform/middleware/usage-tracking-express.ts` — Express `onResponse` hook tracking `/api/signals/**` calls into `UsageMeteringService` (already exists)
- `POST /api/v1/internal/billing/usage` — dogfood endpoint for internal accounts to inspect their usage + overage charges
- No hard enforcement in Phase 0 — track-only, verify data accuracy before adding blockers

## Implementation Order

1. **Route consolidation** (unlocks metering touchpoints)
2. **Usage metering wiring** (verifiable via existing UsageMeteringService)
3. **OpenAPI spec** (documentation, lowest risk)

## Acceptance Criteria

- All 1340+ tests still pass after each phase
- `signals-api-routes.ts` under 200 LOC after extraction
- Usage metering emits `trackApiCall()` on every `/api/signals*` request
- Dogfood endpoint returns snapshot for authenticated internal caller
- OpenAPI JSON validates against 3.1 schema (openapi: "3.1.0" top-level key present)

## Risks

- Route consolidation: 2 D1 subscription services use different schemas (`SignalSubscription` vs `SignalSubscriptionRow`); unify carefully to avoid data loss
- Metering: InMemoryCounter resets on restart — acceptable for Phase 0; document as known limitation
- OpenAPI: Static file won't auto-update — acceptable since API surface is relatively stable at revenue launch

## Out of Scope

- x402 micropayments (Phase 3)
- MCP marketplace integration
- ML fusion engine
- Hard overage enforcement / billing charges
