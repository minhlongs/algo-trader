# Phase 2: Extract Shared Kernel — Complete

**Date:** 2026-06-29
**Commit:** 6c3a17cf8

## What Changed

Extracted foundational modules from `src/` into `src/shared/` as part of the strict-separation architecture refactor.

### Modules Moved to shared/
- **types/** — License types, ILP types, delta-neutral types, semantic relationships
- **config/** — env.ts (config loader), llm-config.ts
- **db/** — postgres-client.ts, migration-runner.ts
- **utils/** — logger.ts, hmac-verifier.ts, sentry-init.ts, tracing.ts
- **messaging/** — NATS JetStream, Redis, message bus interface, topic schema (8 files)
- **resilience/** — circuit breaker, rate limiter, recovery manager, resilient fetch, strategy state store (6 files)
- **validation/** — directory created (empty subdirs, content stays in src/validation/ for now)

### Contract Tests (TDD Gate)
5 integration test files, 131 tests:
- shared-types-contract (34): LicenseTier enum, IStrategy, MarketInfo, Order interfaces
- shared-db-contract (29): DbConfig, getDbClient singleton, runMigrations, migration files
- shared-config-contract (8): 23 config keys, fallback defaults, env var reading
- shared-utils-contract (25): Winston logger, HMAC round-trip, Sentry noop, OpenTelemetry
- shared-validation-contract (35): Zod primitives, SandboxInputSchema, trackClickSchema

### Import Rewrites
- ~250 files had import paths rewritten from old dirs to shared/ paths
- 28 test files needed vi.mock path fixes (postgres-client, messaging, resilience, utils)
- 2 test files needed source-level import fixes (shared-config-contract, signal-ingest-hmac)

### Deletions
- src/config/ (2 files → shared/config/)
- src/messaging/ (9 files → shared/messaging/)
- src/resilience/ (6 files → shared/resilience/)
- src/utils/ (4 files → shared/utils/)
- src/types/ (4 files → shared/types/)

### Retained (not ready for shared/)
- src/db/ — has business modules: pnl-service, tenant-credentials-repository, trade-repository
- src/validation/ — content not yet classified

## Gate Results

| Gate | Status |
|------|--------|
| Contract tests pass | ✅ 131/131 |
| All tests pass | ✅ 2,400/2,404 (4 pre-existing DB failures) |
| tsc --noEmit | ✅ 0 errors |
| Lint (new warnings) | ✅ 9 in shared/ |
| shared → desk/platform | ✅ Zero imports |
| Old dirs deleted | ✅ 5 removed |

## Key Decisions
- Used relative paths instead of @/shared/* aliases (matches existing conventions)
- Business logic strip deferred to Phase 3 (tier defaults, tenant-filter, trading helpers)
- src/db/ retained with both shared-kernel and business modules — Phase 3 will split

## Next: Phase 3 — Split Desk and Platform
