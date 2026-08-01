# Compliance Remaining Work — Implementation Plan

## Status

Complete — All 5 phases verified, code-reviewer passed, AUD-001 and RL-001 fully met.

## Problem

Compliance audit coverage has gaps:
- `credentials.upsert` has no emitter (only deletion emitter exists)
- `credentials-routes.ts` calls `appendTenantAuditLog` directly, bypassing emitters
- `trading-pipeline.ts` uses `ImmutableTradeAudit` (file-based) but not the tenant audit log
- `redis-rate-limiter.ts` hardcodes `endpoint: ''` in audit event

## Phases

| # | Phase | File | Agent | Deps | Status |
|---|-------|------|-------|------|--------|
| 1 | Add `emitCredentialUpsertAuditEvent` emitter | `phase-01-add-upsert-emitter.md` | fullstack-developer | — | Complete |
| 2 | Wire `emitTradeAuditEvent` in trading-pipeline | `phase-02-wire-trading-pipeline.md` | fullstack-developer | 1 | Complete |
| 3 | Replace direct `appendTenantAuditLog` in credentials-routes | `phase-03-fix-credentials-routes.md` | fullstack-developer | 1 | Complete |
| 4 | Fix hardcoded `endpoint: ''` in rate-limiter | `phase-04-fix-rate-limiter-endpoint.md` | fullstack-developer | — | Complete |
| 5 | Verify tests pass | `phase-05-verify-tests.md` | tester | 1–4 | Complete |

## Acceptance Criteria

- AUD-001: `appendTenantAuditLog` invoked for `trade_executed`, `trade_rejected`, `config_changed`, `credentials.upsert`
- RL-001: Every 429 emits audit event with enriched metadata `{ tenantId, endpoint, tier, remainingMs, retryAfter }`

## Files Modified

- `src/platform/audit/audit-hooks.ts` — Added `emitCredentialUpsertAuditEvent`, `emitConfigAuditEvent`
- `src/platform/audit/__tests__/audit-hooks.test.ts` — Added test for `emitCredentialUpsertAuditEvent`, strengthened RL-001 metadata assertion
- `src/desk/trading-pipeline.ts` — Wired `emitTradeAuditEvent` for trade_executed and trade_rejected
- `src/platform/api/routes/credentials-routes.ts` — Replaced direct `appendTenantAuditLog` with emitters
- `src/forest/rate-limit/redis-rate-limiter.ts` — Fixed hardcoded `endpoint: ''`, passed `options.endpoint` from middleware

## Completion

- Date completed: 2026-08-01
- All 5 phases: Complete
- Tests: 6/6 passing
- Code review: passed (informational finding on `tokenSubscriberId` identity format — not a blocker)
- Feature flag: `AUDIT_HOOK_ENABLED` (default true) provides instant rollback
- Acceptance criteria: AUD-001 (`appendTenantAuditLog` invoked for all required event types), RL-001 (every 429 emits enriched metadata) — both met
## Rollback

- Feature flag `AUDIT_HOOK_ENABLED` (default true) in `audit-hooks.ts` to disable new emitters
- Rate limiter already degrades to "allow + log" when Redis is down
