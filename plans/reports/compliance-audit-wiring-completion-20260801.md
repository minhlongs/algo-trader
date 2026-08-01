# Compliance Audit Wiring — Completion Report

**Status:** Complete — 5/5 phases done, 6/6 tests passing.
**Plan:** `plans/260801-1142-compliance-remaining-work`
**Date:** 2026-08-01

## Coverage Closed

| Phase | Change | Status |
|---|---|---|
| 1 | Added `emitCredentialUpsertAuditEvent` | Done |
| 2 | Wired `emitTradeAuditEvent` in `trading-pipeline.ts` | Done |
| 3 | Replaced direct `appendTenantAuditLog` in `credentials-routes.ts` | Done |
| 4 | Fixed hardcoded `endpoint: ''` in `redis-rate-limiter.ts` | Done |
| 5 | 6/6 tests pass | Verified |

## Files Modified

- `src/platform/audit/audit-hooks.ts`
- `src/platform/audit/__tests__/audit-hooks.test.ts`
- `src/desk/trading-pipeline.ts`
- `src/platform/api/routes/credentials-routes.ts`
- `src/forest/rate-limit/redis-rate-limiter.ts`

## Acceptance Criteria

- AUD-001 — `appendTenantAuditLog` invoked for `trade_executed`, `trade_rejected`, `config_changed`, `credentials.upsert` — met
- RL-001 — Every 429 emits enriched metadata `{ tenantId, endpoint, tier, remainingMs, retryAfter }` — met

## Rollback & Risk

- Feature flag `AUDIT_HOOK_ENABLED` (default true) disables new emitters instantly.
- Rate limiter already degrades to "allow + log" when Redis is down.
- No breaking changes to public contracts.

## Reviewer Note (informational)

`tokenSubscriberId` comes from JWT `claims?.sub`; it may be opaque rather than human-readable. Audit trail actor column is correct, but the value may not map 1:1 to a subscriber display name. Worth confirming with the auth team.
