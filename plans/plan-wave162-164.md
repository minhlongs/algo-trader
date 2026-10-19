# Implementation Plan: Wave 162-164 Quantitative Desks

**Status:** IN PROGRESS  
**Estimated Effort:** 3 Phases  
**Target:** 100% tests green, 0 TS errors, zero `:any` types, $\le 150$ LOC per file.

---

## Phases

### Phase 1: Desk 162 — Black (1976) Futures Option Engine
- [ ] Create `src/desk/black76/black76-types.ts`
- [ ] Create `src/desk/black76/black76-math.ts`
- [ ] Create `src/desk/black76/black76-engine.ts`
- [ ] Create `tests/unit/desk/black76/black76-suite.test.ts`

### Phase 2: Desk 163 — Ho-Lee (1986) Term Structure Model
- [ ] Create `src/desk/holee/holee-types.ts`
- [ ] Create `src/desk/holee/holee-math.ts`
- [ ] Create `src/desk/holee/holee-engine.ts`
- [ ] Create `tests/unit/desk/holee/holee-suite.test.ts`

### Phase 3: Desk 164 — Madhavan-Richardson-Roomans (1997) Flow Dynamics
- [ ] Create `src/desk/mrrflow/mrrflow-types.ts`
- [ ] Create `src/desk/mrrflow/mrrflow-math.ts`
- [ ] Create `src/desk/mrrflow/mrrflow-engine.ts`
- [ ] Create `tests/unit/desk/mrrflow/mrrflow-suite.test.ts`

### Phase 4: Validation, Documentation, Memory & Commit
- [ ] Run `npx vitest run tests/unit/desk/black76/ tests/unit/desk/holee/ tests/unit/desk/mrrflow/`
- [ ] Verify `npx tsc --noEmit`
- [ ] Verify LOC $\le 150$ per file
- [ ] Update `docs/README.md` and `docs/project-roadmap.md`
- [ ] Create memory file in `.claude/projects/-Users-macbook/memory/` and update `MEMORY.md`
- [ ] Commit with conventional format and co-authorship attribution
- [ ] Merge to `main`
