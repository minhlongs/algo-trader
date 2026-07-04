# Plan: Wire Dead Routes + Server Polish + Test Coverage

**Created:** 2026-07-01 | **Status:** complete | **Source:** brainstorm-260701-2343
**Context:** Phases 39-52 complete. Scout found 9 orphaned routes, 7 broken scripts, test gaps.

## Phase Summary

| # | Phase | Status | Depends On |
|---|-------|--------|------------|
| 53 | Wire 9 Orphaned Routes | complete | — |
| 54 | Server Polish & Cleanup | complete | — (parallel-safe with 53) |
| 55 | Route Test Coverage Sprint | complete | Phase 53 |

## Key Constraint

No changes to route business logic. Wiring only — these routes are fully coded and tier-gated.
All imports already resolve (typecheck passes). Mount paths follow existing conventions in `server.ts`.

---

See detailed phase files:
- `phase-53-wire-orphaned-routes.md`
- `phase-54-server-polish-cleanup.md`
- `phase-55-route-test-coverage.md`
