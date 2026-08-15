---
title: "Phase 35: Audit Logging & Rate Limiting Hardening"
description: "Unify audit logging, wire canonical tier config to rate limiter, add Zod validation, E2E integration test"
status: in-progress
priority: P1
effort: 12h
branch: main
tags: [security, compliance, audit, rate-limit, phase-35]
created: 2026-08-13
---

## Situation Analysis

Significant infrastructure exists. This plan fills gaps, not builds from scratch.

### Existing (working, 84 tests passing)

| System | Location | Tests | Status |
|--------|----------|-------|--------|
| Audit log (hash-chain) | `src/seed/security/audit-log.ts` (456L) | 28 pass | Working |
| Audit middleware (auto) | `src/seed/security/audit-middleware.ts` (145L) | in platform tests | Working |
| Audit service (CRUD/export) | `src/platform/audit/audit-log-service.ts` (255L) | 63 pass | Working |
| Redis rate limiter (sliding window) | `src/forest/rate-limit/` (4 modules) | 23 pass | Working |
| Canonical tier config | `src/seed/config/tiers.ts` (54L) | none | Defined |
| DB migrations | 038-041 (audit schema) | — | Applied |

### Gaps (what this plan addresses)

1. **Dual audit tables**: `audit_log` + `tenant_audit_logs` — need unification into single table with hash chain
2. **Missing Zod schemas**: No Zod validation on `IAuditEntry` creation — raw objects passed to `logAudit()`
3. **SECURITY: Rate limiter default tier mismatch**: `tier-config.ts:48-51` DEFAULT=60/min vs canonical FREE=10/min — unknown tiers get 6x more permissive limits
4. **No E2E audit trail test**: No test verifies request -> middleware -> DB -> query roundtrip
5. **No audit middleware on signal API server**: `src/api/server.ts:97-102` missing audit middleware
6. **Documentation gap**: No docs on audit/rate-limit architecture

### What is NOT in scope

- KYC/AML integration
- Encryption at rest (Phase 35b)
- Modifying existing route handlers (middleware-only approach)
- OWASP assessment / third-party audit

---

## Phase Breakdown

| # | Name | Effort | Depends On | Files Modified | Files Created |
|---|------|--------|------------|----------------|---------------|
| 01 | Audit Logging Unification | 3h | None | `src/seed/security/audit-log.ts`, `src/db/migrations/`, `src/platform/audit/` | — |
| 02 | Rate Limiter Canonical Tier Wiring | 2h | None | `src/forest/rate-limit/tier-config.ts` | — |
| 03 | Zod Schemas for Audit Entries | 2h | Phase 01 | — | `src/seed/security/schemas/audit-entry-schema.ts` |
| 04 | Integration Test: Audit Trail E2E | 3h | Phase 01, 02, 03 | — | `tests/integration/audit-trail-e2e.test.ts` |
| 05 | Documentation | 2h | Phase 01-04 | `docs/system-architecture.md` | — |

---

## Key Decisions

1. **Express over Fastify**: Despite `package.json` listing fastify, the codebase is 100% Express 5.2.1. The 4 Fastify plugin files are dead code. Plan uses Express middleware patterns exclusively.
2. **Middleware-only approach**: No route handler modifications. Audit + rate limit applied via `app.use()` at server level.
3. **Fail-closed audit, fail-open rate limit**: Audit write failure throws (integrity > availability). Rate limiter Redis failure allows request (availability > throttling).
4. **PostgreSQL for audit, Redis for rate limit**: Existing persistence layers. No new infrastructure.

---

## Dependency Graph

```
Phase 01 (Audit Unification) ──┐
                                ├──> Phase 03 (Zod Schemas) ──┐
Phase 02 (Rate Limiter) ───────┤                               ├──> Phase 04 (E2E Test) ──> Phase 05 (Docs)
                                └───────────────────────────────┘
```

Phases 01 and 02 are independent and can run in parallel.

---

## File Ownership (no parallel conflicts)

| Phase | Owner | Files |
|-------|-------|-------|
| 01 | audit-unification | `src/seed/security/*`, `src/platform/audit/*`, `src/db/migrations/*` |
| 02 | rate-limiter-wiring | `src/forest/rate-limit/*` |
| 03 | zod-schemas | `src/seed/security/schemas/*` |
| 04 | e2e-tests | `tests/integration/*` |
| 05 | docs | `docs/*` |

---

## Rollback Plan

| Phase | Rollback | Risk |
|-------|----------|------|
| 01 | Revert audit middleware addition to signal server (remove import) | Low — middleware is additive |
| 02 | Revert `tier-config.ts` changes (restore local definitions) | Low — re-exports preserve backward compat |
| 03 | Delete schema file, remove imports | Zero — purely additive |
| 04 | Delete test file | Zero — tests don't affect production |
| 05 | Revert docs changes | Zero — documentation only |

---

## Test Matrix

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| Audit log (hash chain) | Existing 28 tests | Phase 04 | — |
| Audit middleware | Existing platform tests | Phase 04 | — |
| Audit service (CRUD) | Existing 63 tests | Phase 04 | — |
| Rate limiter | Existing 23 tests | Phase 04 | — |
| Zod schemas | Phase 03 new | Phase 04 | — |
| Full audit trail | — | Phase 04 | Phase 04 |

---

## Success Criteria

- [ ] Single `audit_log` table with hash chain (no duplicate tables)
- [ ] `IAuditEntry` validated by Zod schema before DB write
- [ ] Rate limiter uses canonical `TIER_RATE_LIMITS` from `seed/config/tiers.ts`
- [ ] E2E test: POST mutation -> audit entry in DB -> query returns entry
- [x] All 4324+ existing tests still pass (excluding pre-existing 25 failures)
- [ ] Zero new `:any` types
- [ ] Zero `console.log`/`console.warn`/`console.error` in new code
- [ ] All new files under 200 lines
- [ ] `npx tsc --noEmit` exits 0

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration breaks existing audit queries | Low | High | Additive columns only; old columns preserved; backfill in batches |
| Dual table confusion during migration window | Medium | Medium | Feature flag: query both tables during transition, deduplicate |
| Rate limiter tier mismatch between old/new code | Low | Low | `resolveLimits()` fallback preserved; canonical source is additive |
| E2E test flakiness (Redis/PG timing) | Medium | Medium | Use ioredis-mock + mock DB client in unit; real Redis/PG in CI integration only |
| `tsc` errors from new Zod imports | Low | Medium | Run `tsc --noEmit` after each phase |

---

## Verification Report (template)

```
Build:      [x] `npx tsc --noEmit` — exit 0 (pre-existing zod/expressInterop warnings only)
Tests:      [x] 85/85 affected tests pass; 4299/4324 full suite (25 pre-existing failures)
Migration:  [ ] `psql` — audit_log table has hash_chain columns
Rate Limit: [x] tier-config.ts canonical, DEFAULT_TIER_LIMITS=10/min, all rate-limit tests pass
Audit:      [x] auditMiddleware wired into both signal + platform API servers
Git Push:   [x] pushed commits 09a8a362 + 4e3159ba to PR #219
Timestamp:  2026-08-13T21:20:00Z
```
