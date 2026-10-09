# Implementation Plan: Wave 159-161 Quantitative Trading Desks

## Desk 159: Bjerksund-Stensland (1993) American Option Engine
- [ ] `src/desk/bjerksund93/bjerksund93-types.ts`
- [ ] `src/desk/bjerksund93/bjerksund93-math.ts`
- [ ] `src/desk/bjerksund93/bjerksund93-engine.ts`
- [ ] `tests/unit/desk/bjerksund93/bjerksund93-suite.test.ts`

## Desk 160: Vasicek (1977) Gaussian Short-Rate Engine
- [ ] `src/desk/vasicekrate/vasicekrate-types.ts`
- [ ] `src/desk/vasicekrate/vasicekrate-math.ts`
- [ ] `src/desk/vasicekrate/vasicekrate-engine.ts`
- [ ] `tests/unit/desk/vasicekrate/vasicekrate-suite.test.ts`

## Desk 161: Huang-Stoll (1997) Microstructure Spread Decomposition Engine
- [ ] `src/desk/huangstoll/huangstoll-types.ts`
- [ ] `src/desk/huangstoll/huangstoll-math.ts`
- [ ] `src/desk/huangstoll/huangstoll-engine.ts`
- [ ] `tests/unit/desk/huangstoll/huangstoll-suite.test.ts`

## Quality Gates & Verification
- [ ] Run `npx vitest run tests/unit/desk/`
- [ ] Run `npx tsc --noEmit`
- [ ] Audit all files $\le 150$ LOC
- [ ] Sync Documentation & Memory
- [ ] Clean conventional commit
