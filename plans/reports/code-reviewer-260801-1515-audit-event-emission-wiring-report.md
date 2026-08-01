# Code Review: Audit-Event-Emission Wiring
Date: 2026-08-01

## Scope
Files: src/desk/trading-pipeline.ts, src/platform/api/routes/credentials-routes.ts, src/forest/rate-limit/redis-rate-limiter.ts, src/platform/audit/audit-hooks.ts, src/platform/audit/__tests__/audit-hooks.test.ts
LOC changed: ~60 across 4 production files + test additions

## Overall Assessment
Wire-up is clean and consistent. All acceptance criteria met except one uncovered production path. No breaking changes, no type errors, no lint regressions. Error-boundary pattern is uniform across all three emitters.

## Acceptance Criteria Coverage

### AUD-001 — MET (with gap)
- trade_executed — wired in trading-pipeline.ts after wallet.recordTrade
- trade_rejected — wired in trading-pipeline.ts in HALT/HARD_STOP branch
- credentials.upsert — wired in credentials-routes.ts after repository.save
- config_changed — hook exists but no production call site found. emitConfigAuditEvent is defined in audit-hooks.ts and tested, but grep on src/platform/audit/ and src/platform/api/ returns zero production usages.

### RL-001 — MET
- checkRateLimit now accepts CheckRateLimitOptions with optional endpoint
- 429 branch calls emitRateLimitAuditEvent with tenantId, tier, endpoint, remainingMs: 0, retryAfter
- Middleware passes req.path as endpoint

## Critical
None.

## High Priority
None.

## Medium Priority
config_changed production wiring gap. The hook is defined and unit-tested but no production caller emits it. If the team intended emitConfigAuditEvent to replace direct appendTenantAuditLog calls elsewhere, that migration is incomplete. Verify whether a config mutation endpoint exists that should call this hook.

## Low Priority
None.

## Edge Cases
- trade_rejected path returns early after emitting audit event — no further pipeline execution, correct.
- Rate limiter audit failure is caught and logged but does not block 429 response — correct non-blocking pattern.
- emitTradeAuditEvent uses middleware-style try-catch in trading-pipeline.ts, matching existing error handling style.

## Positive Observations
- Consistent try-catch placement around all audit hooks prevents audit failures from breaking business logic.
- No new lint or type errors introduced (tsc verified clean).
- Test count increased as expected (5 to 6).

## Recommended Actions
1. Verify whether config_changed has a production caller outside the reviewed diff. If not, add one or remove the unused hook.
2. No other changes needed.

## Metrics
- Type Coverage: maintained
- Test Coverage: AUD-001 tests pass, RL-001 tests pass
- Linting Issues: 0 new

## Unresolved Questions
Where is the intended production call site for emitConfigAuditEvent?
