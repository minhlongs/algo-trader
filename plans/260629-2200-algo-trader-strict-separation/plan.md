---
title: "Algo-Trader Strict Separation Architecture"
description: "Split 540-file codebase into desk/ (solo proprietary trading) + platform/ (RaaS subscriber) + shared/ (kernel) bounded contexts. 10-week phased migration preserving all 2,214 tests."
status: in-progress
priority: P1
branch: "feat/phase02-extract-shared-kernel"
tags: [architecture, refactor, separation, tdd]
blockedBy: []
blocks: []
created: "2026-06-29T15:12:32.507Z"
createdBy: "ck:plan"
source: skill
mode: tdd
brainstorm: "../../plans/reports/brainstorm-report-260629-2200-algo-trader-platform-architecture-audit.md"
---

# Algo-Trader Strict Separation Architecture

## Overview

Split the 540-file, 65-module TypeScript codebase into three bounded contexts with clean dependency rules. Desk runs all 52+ strategies on proprietary capital (manifesto-compliant, single operator, CLI-only). Platform serves RaaS subscribers (multi-tenant, tier-gated, REST+WS API). Shared kernel provides primitives used by both (types, DB, config, utils, validation — zero business logic).

**Current state**: 196 test files, 2,214 tests all passing. 30 untested modules. 22+ files >400 lines. 40 modified files in working tree (mid-refactor). 5 deleted migrations. Roadmap stale since April 2026.

**Target state**: Clean separation with desk/ + platform/ + shared/. All tests pass at every phase gate. Zero files >200 lines. Max 10 untested modules. All migrations accounted for. No circular dependencies between contexts.

## Phases

| Phase | Name | Status | Duration | TDD Gate |
|-------|------|--------|----------|----------|
| 1 | [Stabilize Working Tree](./phase-01-stabilize-working-tree.md) | **Complete** | Week 1-2 | Tests for 5 highest-risk modules written first |
| 2 | [Extract Shared Kernel](./phase-02-extract-shared-kernel.md) | **Complete** | Week 3-4 | Integration tests for shared module contracts written first |
| 3 | [Split Desk and Platform](./phase-03-split-desk-and-platform.md) | Pending | Week 5-8 | Boundary contract tests written first |
| 4 | [Clean Up and Document](./phase-04-clean-up-and-document.md) | Pending | Week 9-10 | Strategy base class tests written first |

## Dependencies

- Phase 2 depends on Phase 1 (working tree must be stable before extraction)
- Phase 3 depends on Phase 2 (shared kernel must exist before splitting)
- Phase 4 depends on Phase 3 (boundaries must be set before cleanup)

## Validation Log

### Session 1 — 2026-06-29
**Trigger:** Initial plan validation after architecture brainstorm
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** Where should cross-cutting modules messaging/ (NATS, BullMQ) and resilience/ (circuit breakers, recovery) live?
   - Options: Platform owns them | Shared kernel (Recommended) | Duplicate light versions
   - **Answer:** Shared kernel
   - **Rationale:** Both desk and platform need async messaging and circuit breakers. These are infrastructure, not business logic — they belong in shared kernel.

2. **[Architecture]** How does platform provide desk-owned strategies to subscribers?
   - Options: Direct import via shared interface (Recommended) | Internal API bridge | Strategy registry pattern
   - **Answer:** Direct import via shared interface (IStrategy in shared/types/)
   - **Rationale:** Platform imports desk strategy classes through IStrategy interface defined in shared. Tier-gating at API middleware layer before calling strategy. Simplest approach, no network overhead.

3. **[Risk]** Should strategy refactoring (20+ files, base class extraction) stay in Phase 4 or be handled differently?
   - Options: Keep in Phase 4 (Recommended) | Defer to separate plan | Spread across Phase 3
   - **Answer:** Keep in Phase 4
   - **Rationale:** Characterization tests gate the work — if they fail, stop and fix. The refactor saves ~7,000 lines of duplication and is better done after boundaries are stable.

4. **[Scope]** What's the decision rule for keeping vs deleting the 5 deleted migrations?
   - Options: Require down-scripts | Check DB history (Recommended) | Delete all, fix later
   - **Answer:** Check DB history table
   - **Rationale:** Query `_prisma_migrations` table. If migration was applied to any environment (dev/prod) → restore and keep. If never applied → safe to delete.

#### Confirmed Decisions
- messaging/ + resilience/: Moved from platform to shared kernel
- Strategy access: Direct import via IStrategy interface in shared
- Strategy refactoring: Remains in Phase 4 with characterization test gate
- Migration audit rule: Check _prisma_migrations table, keep if applied, delete if not

#### Action Items
- [ ] Update Phase 2: Add messaging/ and resilience/ to shared kernel extraction
- [ ] Update Phase 3: Move messaging/ and resilience/ from platform to shared in module map
- [ ] Update Phase 3: Document strategy access pattern (direct import via IStrategy)
- [ ] Update Phase 1: Add migration audit rule (check _prisma_migrations table)

#### Impact on Phases
- Phase 1: Add specific migration audit steps referencing _prisma_migrations table
- Phase 2: Shared kernel now includes messaging/ and resilience/ modules
- Phase 3: Platform module count reduced (messaging/resilience moved to shared); add strategy access pattern documentation
- Phase 4: No changes (strategy refactoring stays, characterization gate confirmed)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy ownership | Desk owns all 52+ strategies | Platform provides tier-gated access via config, not code duplication |
| DB schema | Shared DB, tenant-column only in platform tables | Desk tables: no tenantId. Platform tables: always tenantId |
| Auth location | Platform only | Desk = single operator via CLI/env |
| API surface | Platform=REST+WS, Desk=CLI only | Desk is operator-only; platform is subscriber-facing |
| LLM pipeline | Desk only | Proprietary alpha; subscribers consume signals, not raw inference |
| Migration order | Shared → Platform → Desk | Dependency chain |

## Non-Goals (Explicitly Out of Scope)

- Adding new features during separation
- Changing strategy logic or trading behavior
- Modifying pricing tiers or billing logic
- Implementing Phase 34 (A/B Testing) or PROJECT.md personalization framework
- Database provider migration (staying on PostgreSQL)
- Framework migration (staying on Fastify + Express)
