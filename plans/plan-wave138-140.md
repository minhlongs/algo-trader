# Implementation Plan — Wave 138-140 Desks

## Phases

- [x] **Phase 1: Desk 138 — Asian Options Engine (Kemna-Vorst & Turnbull-Wakeman)**
  - [x] Implement `src/desk/asian/asian-types.ts`
  - [x] Implement `src/desk/asian/asian-math.ts`
  - [x] Implement `src/desk/asian/asian-engine.ts`
  - [x] Implement `tests/unit/desk/asian/asian-suite.test.ts`
  - [x] Run Vitest to verify Desk 138 tests pass (5/5 green)

- [x] **Phase 2: Desk 139 — Leland-Toft (1996) Optimal Capital Structure Credit Engine**
  - [x] Implement `src/desk/lelandtoft/leland-toft-types.ts`
  - [x] Implement `src/desk/lelandtoft/leland-toft-math.ts`
  - [x] Implement `src/desk/lelandtoft/leland-toft-engine.ts`
  - [x] Implement `tests/unit/desk/lelandtoft/leland-toft-suite.test.ts`
  - [x] Run Vitest to verify Desk 139 tests pass (5/5 green)

- [x] **Phase 3: Desk 140 — Madhavan-Richardson-Roomans (1997) Microstructure Engine**
  - [x] Implement `src/desk/madhavan/madhavan-types.ts`
  - [x] Implement `src/desk/madhavan/madhavan-math.ts`
  - [x] Implement `src/desk/madhavan/madhavan-engine.ts`
  - [x] Implement `tests/unit/desk/madhavan/madhavan-suite.test.ts`
  - [x] Run Vitest to verify Desk 140 tests pass (5/5 green)

- [x] **Phase 4: Full Suite Certification, Docs & Git Commit**
  - [x] Run complete desk test suite (3,122 tests green)
  - [x] Check `npx tsc --noEmit` (0 errors)
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [x] Commit changes to git branch `feat/wave138-140-quant-desks`
