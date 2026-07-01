---
phase: 2
title: "Extract Shared Kernel"
status: complete
priority: P1
effort: "2 weeks"
dependencies: [1]
---

# Phase 2: Extract Shared Kernel

## Overview

Move foundational modules into `src/shared/` — types, config, db, utils, logger, validation, messaging, resilience. Strip any business logic found in these modules. Update all imports across codebase. The shared kernel must have zero dependencies on desk or platform code.

## TDD Gate (Tests First)

**Before extraction, write integration contract tests for each shared module:**

1. `tests/integration/shared-types-contract.test.ts` — verify all exported types resolve, enums have expected values, interfaces are structurally sound
2. `tests/integration/shared-db-contract.test.ts` — verify Prisma client creation, connection, migration-runner behavior
3. `tests/integration/shared-config-contract.test.ts` — verify env parsing, config shape, required keys
4. `tests/integration/shared-utils-contract.test.ts` — verify logger, crypto utils, rate-limiter primitive signatures
5. `tests/integration/shared-validation-contract.test.ts` — verify Zod schemas parse valid input, reject invalid input

These tests verify the contracts that desk and platform will depend on. They must pass BEFORE modules move.

## Requirements

### Functional
- Extract `types/`, `config/`, `db/`, `utils/`, `logger/`, `validation/` into `src/shared/`
- Strip any business logic from shared modules
- Update all import paths across codebase
- All 2,214+ existing tests must pass with new import paths

### Non-Functional
- Shared kernel must have ZERO imports from `src/desk/` or `src/platform/`
- Shared kernel must have ZERO business logic (no strategy code, no billing, no auth)
- Import path updates must be automated (script), not manual
- `tsc --noEmit` must pass at every intermediate step

## Architecture

### Before (Current)
```
src/
├── types/          # Scattered type definitions
├── config/         # Env config with some business defaults
├── db/             # Prisma client + migrations + postgres-client
├── utils/          # Logger, crypto, misc utilities
├── validation/     # Zod schemas
├── api/            # REST routes (platform)
├── strategies/     # Trading strategies (desk)
├── [...65 modules total...]
```

### After (Target)
```
src/
├── shared/              # KERNEL — zero business logic
│   ├── types/           # All shared interfaces, enums, type guards
│   │   ├── index.ts     # Re-exports all types
│   │   ├── tier.ts      # Tier enum (FREE|PRO|ENTERPRISE|MASTER)
│   │   ├── strategy.ts  # IStrategy interface (desk↔platform contract)
│   │   ├── market.ts    # Market, Order, Trade types
│   │   └── api.ts       # Request/Response types
│   ├── config/          # Environment config, constants
│   │   ├── index.ts     # Config loader
│   │   ├── env.ts       # Env var parsing with Zod
│   │   └── constants.ts # Shared constants
│   ├── db/              # Database primitives
│   │   ├── client.ts    # Prisma client (singleton)
│   │   ├── postgres-client.ts
│   │   ├── migration-runner.ts
│   │   └── migrations/  # All SQL/TS migrations
│   ├── utils/           # Pure utility functions
│   │   ├── logger.ts    # Winston logger
│   │   ├── crypto.ts    # Hash, random, AES helpers
│   │   └── rate-limiter-primitive.ts  # Token bucket (no tier logic)
│   ├── validation/      # Zod schemas
│   │   ├── index.ts
│   │   ├── api-schemas.ts
│   │   └── config-schemas.ts
│   ├── messaging/       # Async event infrastructure
│   │   ├── jetstream-manager.ts  # NATS JetStream
│   │   └── bullmq/               # BullMQ queue management
│   └── resilience/      # Circuit breakers, recovery
│       ├── circuit-breaker.ts
│       └── recovery-manager.ts
├── desk/           # Will be populated in Phase 3
└── platform/       # Will be populated in Phase 3
```

### Import Rules (Enforced)
```
shared → NOTHING in desk/ or platform/  (compiler enforced)
desk → shared only                       (can reference platform types for attribution)
platform → shared only                   (can reference desk types for signal contracts)
desk ↔ platform                          (NO direct imports; communicate via shared types)
```

### Business Logic Strip Checklist
| Module | Business logic to remove | Destination |
|--------|------------------------|-------------|
| `config/` | Tier-specific defaults, strategy configs | Move to `desk/config/` and `platform/config/` |
| `db/` | Tenant-filter queries | Move to `platform/db/` |
| `utils/` | Trading-specific helpers | Move to `desk/utils/` |
| `validation/` | Business-specific schemas (strategy params, billing) | Move to respective context |

## Related Code Files

### Create
- `src/shared/types/index.ts` + type files
- `src/shared/config/index.ts` + config files
- `src/shared/db/client.ts` (re-export from current location)
- `src/shared/utils/index.ts` + util files
- `src/shared/validation/index.ts` + schema files
- `tests/integration/shared-types-contract.test.ts`
- `tests/integration/shared-db-contract.test.ts`
- `tests/integration/shared-config-contract.test.ts`
- `tests/integration/shared-utils-contract.test.ts`
- `tests/integration/shared-validation-contract.test.ts`

### Modify
- All 540 source files: update import paths from `../types/` → `@/shared/types/`
- `tsconfig.json`: add path aliases
- `vitest.config.ts`: add path aliases

### Delete (after move)
- `src/types/` (old location)
- `src/config/` (old location)
- `src/db/` (old location — re-exports from shared)
- `src/utils/` (old location)
- `src/validation/` (old location)

## Implementation Steps

### Step 1: TDD Gate — Write Contract Tests (Day 1-3)
1. Write `shared-types-contract.test.ts` — verify Tier enum values, IStrategy shape, Market type fields
2. Write `shared-db-contract.test.ts` — verify Prisma client connects, migrations list is complete
3. Write `shared-config-contract.test.ts` — verify required env vars, config shape, defaults
4. Write `shared-utils-contract.test.ts` — verify logger levels, crypto hash determinism, rate limiter interface
5. Write `shared-validation-contract.test.ts` — verify Zod schemas parse/reject correctly
6. Run contract tests — they test current locations; must pass before moves

### Step 2: Create Shared Directory Structure (Day 3-4)
1. Create `src/shared/` with subdirectories
2. Add `tsconfig.json` path aliases: `@/shared/*` → `src/shared/*`
3. Create barrel exports (`index.ts`) for each shared submodule
4. Verify `tsc --noEmit` with new aliases (no code moved yet)

### Step 3: Move Modules One at a Time (Day 4-8)
For each module (types → config → validation → utils → db):
1. Copy files to `src/shared/<module>/`
2. Strip business logic (see checklist above)
3. Update imports in shared module to use `@/shared/` paths
4. Write import rewrite script for all other files
5. Run script, verify with `tsc --noEmit`
6. Run full test suite
7. Delete old module directory
8. Commit

### Step 4: Global Import Cleanup (Day 8-9)
1. Run import audit: find any remaining relative imports to moved paths
2. Fix any broken imports missed by script
3. Full test suite run
4. `tsc --noEmit` final check

### Step 5: Gate Check (Day 10)
1. All 5 contract tests pass
2. All 2,214+ original tests pass with new imports
3. `tsc --noEmit` zero errors
4. `pnpm lint` under 100 warnings
5. Shared kernel has zero imports from outside `src/shared/` (verify with grep)

## Success Criteria

- [ ] 5 integration contract tests written and passing
- [ ] `src/shared/` created with types, config, db, utils, validation
- [ ] Zero business logic in shared kernel (verified by review)
- [ ] All 2,214+ tests pass with new import paths
- [ ] `tsc --noEmit` zero errors
- [ ] Zero direct imports from shared/ into non-shared modules
- [ ] Path aliases (`@/shared/*`) working in both src/ and tests/

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Import rewrite script misses edge cases | High | Run `tsc --noEmit` after each module move; fix before proceeding |
| Business logic accidentally left in shared | Medium | Review each moved file against strip checklist; second reviewer |
| Path alias breaks test runner | Medium | Update vitest.config.ts alongside tsconfig.json; verify first |
| Circular dependency via shared re-exports | Low | Shared has no imports from desk/platform by construction |

## Completion Notes (2026-06-30)

**Actual scope delivered** (adjusted from plan due to Phase 1 partial extraction):

| Activity | Status |
|----------|--------|
| 5 integration contract tests | ✅ 131 assertions all pass |
| Barrel exports (7 subdirectories + root) | ✅ Created |
| Path aliases (`@shared/*` → `src/shared/*`) | ✅ tsconfig + vitest |
| DB consolidation (migrations → shared/db/) | ✅ Done |
| `src/db/index.ts` → re-export bridge | ✅ Done |
| Zero business logic in shared/ | ✅ Verified |
| Zero desk/platform imports in shared/ | ✅ Verified |
| 2,430 tests pass + 0 type errors | ✅ Gate passed |

**Key decisions:**
- Business services (pnl-service, trade-repository, tenant-credentials-repository) left in `src/db/` for Phase 3
- Old `src/db/postgres-client.ts` and `src/db/migration-runner.ts` kept as dead code (delete in Phase 4 cleanup)
- Empty `src/validation/` directory left as-is (populate or delete in Phase 4)
- Commit: `85ac8714b` on branch `feat/phase02-extract-shared-kernel`
