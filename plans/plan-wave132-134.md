# Implementation Plan — Wave 132-134 Desks

## Phases

- [x] **Phase 1: Desk 132 — Margrabe (1978) Dual-Asset Exchange Option Engine**
  - [x] Implement `src/desk/margrabe/margrabe-types.ts`
  - [x] Implement `src/desk/margrabe/margrabe-math.ts`
  - [x] Implement `src/desk/margrabe/margrabe-engine.ts`
  - [x] Implement `tests/unit/desk/margrabe/margrabe-suite.test.ts`
  - [x] Run Vitest to verify Desk 132 tests pass

- [x] **Phase 2: Desk 133 — Jarrow-Yu (2001) Counterparty Risk & Asymmetric Contagion Engine**
  - [x] Implement `src/desk/jarrowyu/jarrow-yu-types.ts`
  - [x] Implement `src/desk/jarrowyu/jarrow-yu-math.ts`
  - [x] Implement `src/desk/jarrowyu/jarrow-yu-engine.ts`
  - [x] Implement `tests/unit/desk/jarrowyu/jarrow-yu-suite.test.ts`
  - [x] Run Vitest to verify Desk 133 tests pass

- [x] **Phase 3: Desk 134 — Gatheral (2010) No-Dynamic-Arbitrage Transient Impact Engine**
  - [x] Implement `src/desk/gatheral/gatheral-types.ts`
  - [x] Implement `src/desk/gatheral/gatheral-math.ts`
  - [x] Implement `src/desk/gatheral/gatheral-engine.ts`
  - [x] Implement `tests/unit/desk/gatheral/gatheral-suite.test.ts`
  - [x] Run Vitest to verify Desk 134 tests pass

- [x] **Phase 4: Integration, Typecheck, Docs & Git Commit**
  - [x] Full Vitest test run across Desks 132, 133, and 134 (15/15 green)
  - [x] Check `npx tsc --noEmit` (0 errors)
  - [ ] Update `docs/README.md` and `docs/project-roadmap.md`
  - [ ] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [ ] Stage and commit changes to git branch `feat/wave132-134-quant-desks`
