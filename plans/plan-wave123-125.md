# Implementation Plan: Wave 123–125 Quantitative Desks

## Phase 1: Desk 123 Rubinstein (1994) Implied Binomial Tree Engine
- [ ] `src/desk/rubinstein/rubinstein-types.ts`
- [ ] `src/desk/rubinstein/rubinstein-math.ts`
- [ ] `src/desk/rubinstein/rubinstein-engine.ts`
- [ ] `tests/unit/desk/rubinstein/rubinstein-suite.test.ts`

## Phase 2: Desk 124 Lando (1998) Markov Rating Transition Engine
- [ ] `src/desk/lando/lando-types.ts`
- [ ] `src/desk/lando/lando-math.ts`
- [ ] `src/desk/lando/lando-engine.ts`
- [ ] `tests/unit/desk/lando/lando-suite.test.ts`

## Phase 3: Desk 125 Obizhaeva-Wang (2013) Transient Impact Execution Router
- [ ] `src/desk/obizhaevawang/obizhaeva-wang-types.ts`
- [ ] `src/desk/obizhaevawang/obizhaeva-wang-math.ts`
- [ ] `src/desk/obizhaevawang/obizhaeva-wang-engine.ts`
- [ ] `tests/unit/desk/obizhaevawang/obizhaeva-wang-suite.test.ts`

## Phase 4: Integration, Typecheck, Ratchet & Documentation
- [ ] Run full test suite with Vitest
- [ ] Run TypeScript typecheck (`tsc --noEmit`)
- [ ] Verify $\le 200$ LOC boundary across all 12 files
- [ ] Update documentation (`docs/README.md`, `docs/system-architecture.md`, `docs/project-roadmap.md`, `MEMORY.md`)
- [ ] Git commit with conventional commit standards
