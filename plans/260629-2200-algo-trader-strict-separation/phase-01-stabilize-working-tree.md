---
phase: 1
title: "Stabilize Working Tree"
status: complete
priority: P1
effort: "2 weeks"
dependencies: []
---

# Phase 1: Stabilize Working Tree

## Overview

Complete the in-progress refactor of 40 modified files, audit 5 deleted migrations, and add tests to 5 highest-risk untested modules. Freeze all new feature work. Goal: clean working tree with all tests passing and no migration ambiguity.

## TDD Gate (Tests First)

**Before any stabilization work, write tests for these 5 highest-risk modules:**

1. `src/risk/` — Kelly Criterion position sizing (financial loss if broken)
2. `src/execution/polymarket-adapter.ts` — CLOB order execution (money at stake)
3. `src/billing/invoice-generator.ts` — NOWPayments invoice generation (revenue)
4. `src/auth/auth-server.ts` — Better Auth session management (security)
5. `src/middleware/distributed-rate-limiter.ts` — Redis rate limiting (platform reliability)

Each test suite must:
- Cover happy path + 2 error paths minimum
- Use real interfaces (no `any` types)
- Run in isolation (no shared state between tests)
- Verify behavior, not implementation

Gate: These 5 modules go from 0 tests → ≥5 tests each before stabilization proceeds.

## Requirements

### Functional
- Complete or revert all 40 working tree modifications
- Audit 5 deleted migrations: confirm safe removal or restore
- Verify all 2,214 existing tests still pass
- Ensure `tsc --noEmit` produces zero errors

### Non-Functional
- No new features introduced during stabilization
- No import path changes yet (Phase 2 concern)
- Working tree must be clean: `git status` shows zero modified files (or only intentional ones)

## Architecture

Stabilization addresses the current mid-refactor state:
```
Working tree chaos:
  40 modified files (+1151/-1300)
  5 deleted migrations (021, 024, 025)
  Marketplace service: 456 lines rewritten
  Recovery manager: 114 lines added
  Prometheus metrics: 76 lines added
  Audit routes test: 509 lines refactored

Target: Clean working tree
  - All modifications committed with clear messages
  - Migrations audited and resolved
  - Tests pass (2,214+)
  - tsc clean
```

## Related Code Files

### Modified (40 files — must complete review)
- `src/api/routes/__tests__/audit-routes.test.ts` (509 lines changed)
- `src/api/routes/admin-qwen-routes.ts` (36 lines)
- `src/api/routes/marketplace-strategy-routes.ts` (53 lines)
- `src/api/routes/xai-routes.ts` (109 lines)
- `src/api/server.ts` (23 lines)
- `src/api/ws-adapter-redis.ts` (17 lines)
- `src/db/migration-runner.ts` (2 lines)
- `src/db/postgres-client.ts` (2 lines)
- `src/execution/polymarket-adapter.ts` (33 lines)
- `src/feeds/polymarket-websocket-feed.ts` (10 lines)
- `src/index.ts` (31 lines)
- `src/intelligence/alphaear-client.ts` (15 lines)
- `src/lib/license-key-crypto.ts` (37 lines)
- `src/market-data/__tests__/provider-failover.test.ts` (28 lines)
- `src/market-data/gap-detector.ts` (5 lines)
- `src/market-data/sla-tracker.ts` (8 lines)
- `src/marketplace/services/marketplace.service.ts` (456 lines — major refactor)
- `src/messaging/jetstream-manager.ts` (40 lines)
- `src/metering/usage-metering-service.test.ts` (4 lines)
- `src/metering/usage-metering-service.ts` (35 lines)
- `src/middleware/distributed-rate-limiter.ts` (12 lines)
- `src/middleware/prometheus-metrics.ts` (76 lines)
- `src/persistence/file-store.ts` (15 lines)
- `src/raas/__tests__/subscriber-executor.test.ts` (16 lines)
- `src/raas/subscriber-executor.ts` (10 lines)
- `src/resilience/recovery-manager.ts` (114 lines — expanded)
- `src/signal/signal-ttl-enforcer.ts` (4 lines)
- `src/strategies/dna/__tests__/journal-writer.test.ts` (30 lines)
- `src/strategies/dna/journal-writer.ts` (23 lines)
- `src/strategies/dna/orchestrator.ts` (18 lines)
- `src/wiring/vibe-controller.ts` (49 lines)
- `tests/resilience/signal-dedup-race.test.ts` (18 lines)
- `vitest.config.ts` (3 lines)

### Deleted (5 migrations — must audit)
- `src/db/migrations/021_create_tenant_audit_logs.sql`
- `src/db/migrations/021_tenant_credentials.sql`
- `src/db/migrations/024_backfill_referral_codes.ts`
- `src/db/migrations/025-create-marketplace-schema.ts`
- `src/db/migrations/025_create_marketplace_tables.ts`

### Create (TDD gate)
- `src/risk/__tests__/kelly-criterion.test.ts`
- `src/execution/__tests__/polymarket-adapter.test.ts`
- `src/billing/__tests__/invoice-generator.test.ts`
- `src/auth/__tests__/auth-server.test.ts`
- `src/middleware/__tests__/distributed-rate-limiter.test.ts`

## Implementation Steps

### Step 1: TDD Gate — Write Tests First (Day 1-3)
1. Write `kelly-criterion.test.ts` — test position sizing with known inputs/outputs
2. Write `polymarket-adapter.test.ts` — test order creation, signing, submission
3. Write `invoice-generator.test.ts` — test invoice ID generation, line items
4. Write `auth-server.test.ts` — test session creation, validation, expiry
5. Write `distributed-rate-limiter.test.ts` — test sliding window, tier-based limits
6. Run all new tests — they may fail initially (module behavior being pinned)
7. Run full test suite — confirm no regressions from new test files

### Step 2: Audit Deleted Migrations (Day 3-4)
1. Query `_prisma_migrations` table in ALL environments (dev, staging, prod if accessible)
2. For each deleted migration (021_audit_logs, 021_credentials, 024_referral, 025_marketplace_schema, 025_marketplace_tables):
   - If present in `_prisma_migrations` → migration WAS applied → RESTORE file from git
   - If absent from `_prisma_migrations` → migration NEVER applied → safe to delete permanently
3. Document decision for each migration in commit message with evidence
4. If restoring: verify migration file is idempotent (re-running won't fail)

### Step 3: Complete Working Tree Review (Day 4-8)
Review each modified file category:
1. **Marketplace service** (456 lines) — verify rewritten logic preserves API contract
2. **Recovery manager** (114 lines) — verify new recovery paths are correct
3. **Prometheus metrics** (76 lines) — verify metric names, labels, buckets
4. **XAI routes** (109 lines) — verify route handlers unchanged
5. **License key crypto** (37 lines) — verify encryption/decryption still works
6. **All other modified files** — review diffs, commit or revert each

### Step 4: Gate Check (Day 9-10)
1. `pnpm test` — all 2,214+ tests pass (including new TDD tests)
2. `pnpm typecheck` — zero TypeScript errors
3. `pnpm lint` — under 100 warnings
4. `git status` — only intentional modifications remain
5. Commit with message: `chore: stabilize working tree after architecture audit`

## Success Criteria

- [ ] 5 new test suites written (risk, execution, billing, auth, middleware) — ≥5 tests each
- [ ] All 5 deleted migrations audited: restored OR confirmed safe deletion
- [ ] All 40 modified files reviewed: committed with clear messages or reverted
- [ ] `pnpm test` passes: 2,214+ tests, zero failures
- [ ] `pnpm typecheck` passes: zero errors
- [ ] `pnpm lint` passes: under 100 warnings
- [ ] Working tree clean or contains only intentional, documented modifications

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Deleted migration had production data | Medium | Query DB before deciding; restore if any doubt |
| Marketplace service rewrite breaks API | Medium | Compare old/new behavior via test coverage |
| TDD tests expose unknown bugs | Low | Bugs found now are wins — fix them in this phase |
| Review takes longer than estimated | Medium | Parallel review by module category; cut scope if needed |
