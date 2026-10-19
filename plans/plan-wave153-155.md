# Implementation Plan — Wave 153-155 Desks

## Phases

- [x] **Phase 1: Desk 153 — Cox (1975) Constant Elasticity of Variance (CEV) Option Engine**
  - [x] Implement `src/desk/cev/cev-types.ts`
  - [x] Implement `src/desk/cev/cev-math.ts`
  - [x] Implement `src/desk/cev/cev-engine.ts`
  - [x] Implement `tests/unit/desk/cev/cev-suite.test.ts`
  - [x] Run Vitest to verify Desk 153 tests pass

- [x] **Phase 2: Desk 154 — Jarrow-Lando-Turnbull (1997) Markov Rating Transition Credit Engine**
  - [x] Implement `src/desk/jltcredit/jlt-types.ts`
  - [x] Implement `src/desk/jltcredit/jlt-math.ts`
  - [x] Implement `src/desk/jltcredit/jlt-engine.ts`
  - [x] Implement `tests/unit/desk/jltcredit/jlt-suite.test.ts`
  - [x] Run Vitest to verify Desk 154 tests pass

- [x] **Phase 3: Desk 155 — Pástor-Stambaugh (2003) Liquidity Risk & Systematic Reversal Engine**
  - [x] Implement `src/desk/pastorstambaugh/ps-types.ts`
  - [x] Implement `src/desk/pastorstambaugh/ps-math.ts`
  - [x] Implement `src/desk/pastorstambaugh/ps-engine.ts`
  - [x] Implement `tests/unit/desk/pastorstambaugh/ps-suite.test.ts`
  - [x] Run Vitest to verify Desk 155 tests pass

- [x] **Phase 4: Full Suite Certification, Documentation & Git Commit**
  - [x] Run full test suite & `tsc --noEmit`
  - [ ] Update `docs/README.md` and `docs/project-roadmap.md`
  - [ ] Write session memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [ ] Commit with clean git message & attribution
