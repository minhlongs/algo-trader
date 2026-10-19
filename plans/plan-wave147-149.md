# Implementation Plan — Wave 147-149 Desks

## Phases

- [x] **Phase 1: Desk 147 — Heston (1993) Semi-Analytical Characteristic Function Stochastic Volatility Engine**
  - [x] Implement `src/desk/hestonchf/heston-types.ts`
  - [x] Implement `src/desk/hestonchf/heston-math.ts`
  - [x] Implement `src/desk/hestonchf/heston-engine.ts`
  - [x] Implement `tests/unit/desk/hestonchf/heston-suite.test.ts`
  - [x] Run Vitest to verify Desk 147 tests pass (5/5 green)

- [x] **Phase 2: Desk 148 — Cox-Ingersoll-Ross (1985) Multi-Factor Square-Root Term Structure & Credit Engine**
  - [x] Implement `src/desk/circredit/cir-types.ts`
  - [x] Implement `src/desk/circredit/cir-math.ts`
  - [x] Implement `src/desk/circredit/cir-engine.ts`
  - [x] Implement `tests/unit/desk/circredit/cir-suite.test.ts`
  - [x] Run Vitest to verify Desk 148 tests pass (5/5 green)

- [x] **Phase 3: Desk 149 — Hasbrouck (1991) Vector Autoregressive (VAR) Microstructure Price Discovery Engine**
  - [x] Implement `src/desk/hasbrouckvar/hasbrouck-types.ts`
  - [x] Implement `src/desk/hasbrouckvar/hasbrouck-math.ts`
  - [x] Implement `src/desk/hasbrouckvar/hasbrouck-engine.ts`
  - [x] Implement `tests/unit/desk/hasbrouckvar/hasbrouck-suite.test.ts`
  - [x] Run Vitest to verify Desk 149 tests pass (5/5 green)

- [x] **Phase 4: Full Suite Certification, Documentation & Git Commit**
  - [x] Run full test suite & `tsc --noEmit` (15/15 wave tests green, 0 TS errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Write session memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Commit with clean git message & attribution
