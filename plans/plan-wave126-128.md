# Implementation Plan — Wave 126-128 Desks

## Phases

- [x] **Phase 1: Desk 126 — Carr-Madan (1998) Option Pricing**
  - [x] Implement `src/desk/carrmadan/carr-madan-types.ts`
  - [x] Implement `src/desk/carrmadan/carr-madan-math.ts`
  - [x] Implement `src/desk/carrmadan/carr-madan-engine.ts`
  - [x] Implement `tests/unit/desk/carrmadan/carr-madan-suite.test.ts`
  - [x] Run vitest and verify all tests pass

- [x] **Phase 2: Desk 127 — Schönbucher (2000) Factor Credit Default Model**
  - [x] Implement `src/desk/schonbucher/schonbucher-types.ts`
  - [x] Implement `src/desk/schonbucher/schonbucher-math.ts`
  - [x] Implement `src/desk/schonbucher/schonbucher-engine.ts`
  - [x] Implement `tests/unit/desk/schonbucher/schonbucher-suite.test.ts`
  - [x] Run vitest and verify all tests pass

- [x] **Phase 3: Desk 128 — Huberman-Stanzl (2004) Price Manipulation Engine**
  - [x] Implement `src/desk/hubermanstanzl/huberman-stanzl-types.ts`
  - [x] Implement `src/desk/hubermanstanzl/huberman-stanzl-math.ts`
  - [x] Implement `src/desk/hubermanstanzl/huberman-stanzl-engine.ts`
  - [x] Implement `tests/unit/desk/hubermanstanzl/huberman-stanzl-suite.test.ts`
  - [x] Run vitest and verify all tests pass

- [x] **Phase 4: Integration, Typecheck, Docs & Git Commit**
  - [x] Run full test suite: `npx vitest run tests/unit/desk/carrmadan/ tests/unit/desk/schonbucher/ tests/unit/desk/hubermanstanzl/`
  - [x] Run `npx tsc --noEmit`
  - [x] Update `docs/README.md` and `docs/project-roadmap.md`
  - [x] Record memory in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
  - [ ] Commit changes
