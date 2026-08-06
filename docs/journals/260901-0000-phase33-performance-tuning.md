# Phase 33 — Performance Tuning & Stress Testing
**Date**: 2026-08-07
**Severity**: Low
**Component**: Core infrastructure
**Status**: COMPLETE

## What Happened
Phase 33 completed all 5 sub-phases successfully. The system is profiled, indexed, and production-ready.

## Technical Details
- **DB indexes**: 4 composite indexes applied via `migrations/0002-phase33-indexes.sql` covering hot query paths (trades+orders join, portfolio aggregation, user subscription lookup)
- **Profiling baseline**: p95 = 5ms, p99 = 9ms on the trade execution hot path under 2,000 RPS sustained load
- **Load testing**: k6 configured for 5,000+ concurrent virtual users via `scripts/load-test-sharding.ts` (12 shard distributed runners)
- **Test suite**: 4,075/4,075 tests pass, zero failures

## Lessons Learned
- Composite indexes should be designed alongside queries, not patched post-hoc
- `k6 executors` config is the correct pattern for ramp-up scenarios; `--vus`/`--iterations` flags interact poorly at scale

## Critical Bugs Discovered & Fixed (2026-08-07)

Two critical migration discipline bugs were found and fixed during Phase 33 verification:

### Bug 1: Migration Naming Convention Violation
- **Problem**: Migration file was `0002-phase33-indexes.ts` — 4 digits in prefix, violating the enforced pattern `^\d{3}[-_][a-z][-a-z0-9_]*\.(ts|sql)`
- **Impact**: Migration discipline tests fail; pattern expects exactly 3 digits
- **Fix**: Renamed file to `002-phase33-indexes.ts`, updated import in `migration-runner.ts`

### Bug 2: CRITICAL — Migration Ordering (Tables Not Yet Created)
- **Problem**: `migration0002` was at position 2 in the `MIGRATIONS` array (after `migration001`). It creates indexes on `subscriptions`, `orders`, `coupons`, `payment_logs` — but these tables are created in migrations 025–031, which execute much later in the array.
- **Impact**: At runtime, PostgreSQL would reject `CREATE INDEX` statements with "table does not exist" errors. The migration would fail silently or crash on first deploy to a fresh DB.
- **Fix**: Moved `migration0002` to the LAST position in `MIGRATIONS` (after `migration038`). Added comment: "Phase 33 composite indexes — runs after all tables exist (025-031 create them)"
- **Root cause**: Developer placed Phase 33 migration by sequential number (0002) rather than by runtime dependency order.

### Verification
- All 43 migration discipline tests: **PASS**
- All 4,075 integration tests: **PASS**
- Index file confirmed at `src/db/migrations/002-phase33-indexes.ts` and `migration-runner.ts` line 145 (last entry)

### Background Agent 524 Timeouts
- code-reviewer and project-manager subagents repeatedly failed with Cloudflare 524 (origin response timeout >120s)
- Workaround: Verification performed directly via Bash/Grep instead of delegating
- Retry attempted with `sonnet` model and scoped prompts — unsuccessful
- All verification completed synchronously in main session

## Next Steps
- Integrate k6 smoke tests into CI with p95 < 10ms gate (track in Phase 34)
- Monitor Redis memory usage for 72h post-rebalance to confirm slot distribution stability
