# Implementation Plan — Wave 135-137 Desks

## Phases

- [x] **Phase 1: Desk 135 — Goldman-Sosin-Gatto (1979) Lookback Option Engine**
  - [x] Implement `src/desk/goldmansosin/goldman-sosin-types.ts`
  - [x] Implement `src/desk/goldmansosin/goldman-sosin-math.ts`
  - [x] Implement `src/desk/goldmansosin/goldman-sosin-engine.ts`
  - [x] Implement `tests/unit/desk/goldmansosin/goldman-sosin-suite.test.ts`
  - [x] Run Vitest to verify Desk 135 tests pass (5/5 green)

- [x] **Phase 2: Desk 136 — Collin-Dufresne & Goldstein (2001) Stationary Leverage Engine**
  - [x] Implement `src/desk/collindufresne/collin-dufresne-types.ts`
  - [x] Implement `src/desk/collindufresne/collin-dufresne-math.ts`
  - [x] Implement `src/desk/collindufresne/collin-dufresne-engine.ts`
  - [x] Implement `tests/unit/desk/collindufresne/collin-dufresne-suite.test.ts`
  - [x] Run Vitest to verify Desk 136 tests pass (5/5 green)

- [x] **Phase 3: Desk 137 — Bouchaud-Gefen-Potters-Wyart (2004) Microstructure Engine**
  - [x] Implement `src/desk/bouchaud/bouchaud-types.ts`
  - [x] Implement `src/desk/bouchaud/bouchaud-math.ts`
  - [x] Implement `src/desk/bouchaud/bouchaud-engine.ts`
  - [x] Implement `tests/unit/desk/bouchaud/bouchaud-suite.test.ts`
  - [x] Run Vitest to verify Desk 137 tests pass (5/5 green)

- [x] **Phase 4: Integration, Typecheck, Docs & Git Commit**
  - [x] Full Vitest test run across Desks 135, 136, and 137 (15/15 green)
  - [x] Check `npx tsc --noEmit` (0 errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Stage and commit changes to git branch `feat/wave135-137-quant-desks`
