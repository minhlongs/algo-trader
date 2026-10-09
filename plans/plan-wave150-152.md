# Implementation Plan — Wave 150-152 Desks

## Phases

- [x] **Phase 1: Desk 150 — Crank-Nicolson Finite Difference American Option Engine**
  - [x] Implement `src/desk/cranknicolson/crank-types.ts`
  - [x] Implement `src/desk/cranknicolson/crank-math.ts`
  - [x] Implement `src/desk/cranknicolson/crank-engine.ts`
  - [x] Implement `tests/unit/desk/cranknicolson/crank-suite.test.ts`
  - [x] Run Vitest to verify Desk 150 tests pass

- [x] **Phase 2: Desk 151 — Nelson-Siegel-Svensson Extended Credit & Yield Curve Engine**
  - [x] Implement `src/desk/nelsoncurve/nelson-types.ts`
  - [x] Implement `src/desk/nelsoncurve/nelson-math.ts`
  - [x] Implement `src/desk/nelsoncurve/nelson-engine.ts`
  - [x] Implement `tests/unit/desk/nelsoncurve/nelson-suite.test.ts`
  - [x] Run Vitest to verify Desk 151 tests pass

- [x] **Phase 3: Desk 152 — Roll (1984) Effective Bid-Ask Spread Microstructure Engine**
  - [x] Implement `src/desk/rollspread/roll-types.ts`
  - [x] Implement `src/desk/rollspread/roll-math.ts`
  - [x] Implement `src/desk/rollspread/roll-engine.ts`
  - [x] Implement `tests/unit/desk/rollspread/roll-suite.test.ts`
  - [x] Run Vitest to verify Desk 152 tests pass

- [x] **Phase 4: Full Suite Certification, Documentation & Git Commit**
  - [x] Run full test suite & `tsc --noEmit`
  - [ ] Update `docs/README.md` and `docs/project-roadmap.md`
  - [ ] Write session memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [ ] Commit with clean git message & attribution
