# Implementation Plan — Wave 129-131 Desks

## Phases

- [x] **Phase 1: Desk 129 — Heston-Nandi (2000) GARCH Option Pricing**
  - [x] Implement `src/desk/hestonnandi/heston-nandi-types.ts`
  - [x] Implement `src/desk/hestonnandi/heston-nandi-math.ts`
  - [x] Implement `src/desk/hestonnandi/heston-nandi-engine.ts`
  - [x] Implement `tests/unit/desk/hestonnandi/heston-nandi-suite.test.ts`
  - [x] Run Vitest to verify Desk 129 tests pass

- [x] **Phase 2: Desk 130 — Davis-Lo (2001) Contagion Credit Default Engine**
  - [x] Implement `src/desk/davislo/davis-lo-types.ts`
  - [x] Implement `src/desk/davislo/davis-lo-math.ts`
  - [x] Implement `src/desk/davislo/davis-lo-engine.ts`
  - [x] Implement `tests/unit/desk/davislo/davis-lo-suite.test.ts`
  - [x] Run Vitest to verify Desk 130 tests pass

- [x] **Phase 3: Desk 131 — Alfonsi-Fruth-Schied (2010) Non-Linear LOB Execution**
  - [x] Implement `src/desk/alfonsi/alfonsi-types.ts`
  - [x] Implement `src/desk/alfonsi/alfonsi-math.ts`
  - [x] Implement `src/desk/alfonsi/alfonsi-engine.ts`
  - [x] Implement `tests/unit/desk/alfonsi/alfonsi-suite.test.ts`
  - [x] Run Vitest to verify Desk 131 tests pass

- [x] **Phase 4: Integration, Typecheck, Docs & Git Commit**
  - [x] Full Vitest test run across Desks 129, 130, and 131 (13/13 passed)
  - [x] Check `npx tsc --noEmit` (0 errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Stage and commit changes to git branch `feat/wave129-131-quant-desks`
