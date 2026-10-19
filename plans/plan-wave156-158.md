# Implementation Plan: Wave 156-158 Quantitative Trading Desks

## Desk 156: Merton (1973) Continuous Dividend Option Engine
- [ ] `src/desk/mertondividend/mertondividend-types.ts`
- [ ] `src/desk/mertondividend/mertondividend-math.ts`
- [ ] `src/desk/mertondividend/mertondividend-engine.ts`
- [ ] `tests/unit/desk/mertondividend/mertondividend-suite.test.ts`

## Desk 157: Merton (1974) Distance-to-Default & Structural CDS Engine
- [ ] `src/desk/distance2default/distance2default-types.ts`
- [ ] `src/desk/distance2default/distance2default-math.ts`
- [ ] `src/desk/distance2default/distance2default-engine.ts`
- [ ] `tests/unit/desk/distance2default/distance2default-suite.test.ts`

## Desk 158: Kyle (1985) Continuous Auction Microstructure Engine
- [ ] `src/desk/kyleauction/kyleauction-types.ts`
- [ ] `src/desk/kyleauction/kyleauction-math.ts`
- [ ] `src/desk/kyleauction/kyleauction-engine.ts`
- [ ] `tests/unit/desk/kyleauction/kyleauction-suite.test.ts`

## Quality Gates & Verification
- [ ] Run `npx vitest run tests/unit/desk/`
- [ ] Run `npx tsc --noEmit`
- [ ] Audit all files $\le 150$ LOC
- [ ] Sync Documentation & Memory
- [ ] Clean conventional commit
