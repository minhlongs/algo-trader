# Implementation Plan: Waves 120–122 Institutional Desks

## Phases Overview
- [ ] Phase 1: Implement Desk 120 (Garman-Kohlhagen 1983 FX Options Engine)
- [ ] Phase 2: Implement Desk 121 (CreditGrades 2002 Structural Credit Risk Engine)
- [ ] Phase 3: Implement Desk 122 (Lehalle-Moallemi 2018 Multi-Venue Lit/Dark Execution Engine)
- [ ] Phase 4: Unit Testing & Verification (Zero-Mock Vitest Suites)
- [ ] Phase 5: Documentation & Git Commit

## File Manifest
1. `src/desk/garmankohlhagen/garman-kohlhagen-types.ts`
2. `src/desk/garmankohlhagen/garman-kohlhagen-math.ts`
3. `src/desk/garmankohlhagen/garman-kohlhagen-engine.ts`
4. `src/desk/creditgrades/credit-grades-types.ts`
5. `src/desk/creditgrades/credit-grades-math.ts`
6. `src/desk/creditgrades/credit-grades-engine.ts`
7. `src/desk/lehallemoallemi/lehalle-moallemi-types.ts`
8. `src/desk/lehallemoallemi/lehalle-moallemi-math.ts`
9. `src/desk/lehallemoallemi/lehalle-moallemi-engine.ts`
10. `tests/unit/desk/garmankohlhagen/garman-kohlhagen-suite.test.ts`
11. `tests/unit/desk/creditgrades/credit-grades-suite.test.ts`
12. `tests/unit/desk/lehallemoallemi/lehalle-moallemi-suite.test.ts`
