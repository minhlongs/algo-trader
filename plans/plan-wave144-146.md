# Implementation Plan — Wave 144-146 Desks

## Phases

- [x] **Phase 1: Desk 144 — Barone-Adesi & Whaley (1987) Quadratic Approximation American Option Engine**
  - [x] Implement `src/desk/quadraticamerican/baw-types.ts`
  - [x] Implement `src/desk/quadraticamerican/baw-math.ts`
  - [x] Implement `src/desk/quadraticamerican/baw-engine.ts`
  - [x] Implement `tests/unit/desk/quadraticamerican/baw-suite.test.ts`
  - [x] Run Vitest to verify Desk 144 tests pass (6/6 green)

- [x] **Phase 2: Desk 145 — Duffie-Kan (1996) Affine Term Structure Rate & Credit Spread Engine**
  - [x] Implement `src/desk/duffiekan/duffie-kan-types.ts`
  - [x] Implement `src/desk/duffiekan/duffie-kan-math.ts`
  - [x] Implement `src/desk/duffiekan/duffie-kan-engine.ts`
  - [x] Implement `tests/unit/desk/duffiekan/duffie-kan-suite.test.ts`
  - [x] Run Vitest to verify Desk 145 tests pass (6/6 green)

- [x] **Phase 3: Desk 146 — Easley-Kiefer-O'Hara-Paperman (1996) EKOP Structural Microstructure Engine**
  - [x] Implement `src/desk/ekop/ekop-types.ts`
  - [x] Implement `src/desk/ekop/ekop-math.ts`
  - [x] Implement `src/desk/ekop/ekop-engine.ts`
  - [x] Implement `tests/unit/desk/ekop/ekop-suite.test.ts`
  - [x] Run Vitest to verify Desk 146 tests pass (5/5 green)

- [x] **Phase 4: Full Suite Certification, Documentation & Git Commit**
  - [x] Run full test suite & `tsc --noEmit` (17/17 wave tests green, 0 TS errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Write session memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Commit with clean git message & attribution
