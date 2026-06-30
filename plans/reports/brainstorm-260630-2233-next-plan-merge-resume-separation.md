# Brainstorm Report — Next Plan: Merge + Resume Strict Separation

**Date:** 2026-06-30 22:33 ICT | **Topic:** next plan after CF platform go-live

## Problem

5 commits on `fix/worker-deploy-tsconfig` branch. Worker, dashboard, landing deployed. CF Platform Finalize complete. What's next?

## Scout Summary

- Branch `fix/worker-deploy-tsconfig`: 5 commits, NOT merged to main
- Worker: api.cashclaw.cc (SHA 330a8c2a), cron active
- Dashboard: preview URL, not production
- Landing: cashclaw.cc live
- Strict Separation Phase 1 done, Phase 2-4 deferred (plan at `plans/260629-2200-algo-trader-strict-separation/`)
- Pending manual: DNS gray cloud, Twitter/Discord, real USDT payment

## Options Evaluated

| Option | Effort | Value | Risk |
|--------|--------|-------|------|
| A: Merge + Clean Slate | 30min | Low — just hygiene | None |
| B: Go-Live Marketing Push | 2-4hr | High — real users | Manual deps (DNS, social) |
| C: Resume Separation Phase 2 | 2 weeks | Medium — tech debt | Large blast radius (540 files) |

## Decision

**Chosen: Merge + Resume Separation (A + C)**

User selected "Merge + Resume Separation":
1. Merge `fix/worker-deploy-tsconfig` → `main`
2. Clean stale worktrees
3. Begin Phase 2: Extract Shared Kernel (TDD-first)

## Phase 2 Approach (from existing plan)

TDD gate first → 5 integration contract tests. Then move modules one-by-one:
types → config → validation → utils → db (+ messaging, resilience)

Each module: copy → strip business logic → rewrite imports → verify tsc → run tests → commit.

## Constraints

- Zero business logic in shared kernel
- Shared imports nothing from desk/ or platform/
- All 2,430 tests must pass at every step
- `tsc --noEmit` zero errors at every step
- `@/shared/*` path aliases

## Scope Boundary

- Merge branch → main ✅
- Phase 2 (extract shared kernel) ✅
- NOT Phase 3-4 (deferred)
- NOT marketing launch (deferred)
- NOT new features

## References

- [Strict Separation Plan](../260629-2200-algo-trader-strict-separation/plan.md)
- [Phase 2 Detail](../260629-2200-algo-trader-strict-separation/phase-02-extract-shared-kernel.md)
- [CF Platform Finalize Plan](../260630-2150-cf-platform-finalize/plan.md)
