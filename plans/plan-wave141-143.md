# Implementation Plan — Wave 141-143 Desks

## Phases

- [x] **Phase 1: Desk 141 — Merton (1976) Jump-Diffusion Option Pricing Engine**
  - [x] Implement `src/desk/mertonjump/merton-jump-types.ts`
  - [x] Implement `src/desk/mertonjump/merton-jump-math.ts`
  - [x] Implement `src/desk/mertonjump/merton-jump-engine.ts`
  - [x] Implement `tests/unit/desk/mertonjump/merton-jump-suite.test.ts`
  - [x] Run Vitest to verify Desk 141 tests pass (5/5 green)

- [x] **Phase 2: Desk 142 — Longstaff-Schwartz (1995) Two-Factor Defaultable Bond Credit Engine**
  - [x] Implement `src/desk/longstaffschwartz/ls-credit-types.ts`
  - [x] Implement `src/desk/longstaffschwartz/ls-credit-math.ts`
  - [x] Implement `src/desk/longstaffschwartz/ls-credit-engine.ts`
  - [x] Implement `tests/unit/desk/longstaffschwartz/ls-credit-suite.test.ts`
  - [x] Run Vitest to verify Desk 142 tests pass (5/5 green)

- [x] **Phase 3: Desk 143 — Glosten-Milgrom (1985) Information Asymmetry Microstructure Engine**
  - [x] Implement `src/desk/glostenmilgrom/gm-microstructure-types.ts`
  - [x] Implement `src/desk/glostenmilgrom/gm-microstructure-math.ts`
  - [x] Implement `src/desk/glostenmilgrom/gm-microstructure-engine.ts`
  - [x] Implement `tests/unit/desk/glostenmilgrom/gm-microstructure-suite.test.ts`
  - [x] Run Vitest to verify Desk 143 tests pass (5/5 green)

- [x] **Phase 4: Full Suite Certification, Docs & Git Commit**
  - [x] Run complete desk test suite (3,137 tests green)
  - [x] Check `npx tsc --noEmit` (0 errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Commit changes to git branch `feat/wave141-143-quant-desks`
