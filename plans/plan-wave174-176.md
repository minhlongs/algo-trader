# Wave 174-176 Implementation Plan: Quantitative Triad & Deep Modularization

## Overview
Implement Wave 174-176 quantitative trading engines (Turnbull-Wakeman 1991 Arithmetic Asian, Hull-White 1990 One-Factor Term Structure & Bond Options, Garman-Klass 1980 / Parkinson 1980 Range Volatility) while performing deep modularization on files at the 200 LOC ceiling (`leaderboard-routes.ts` and `drawdown-monitor-evaluators.ts`).

## Phase 1: Deep Modularization (<200 LOC Hard Gate)
1. Modularize `src/platform/api/routes/leaderboard-routes.ts` (199 LOC -> ~75 LOC)
   - Extract `src/platform/api/routes/leaderboard-builder.ts`
   - Run vitest `src/platform/api/routes/__tests__/leaderboard-routes.test.ts`
2. Modularize `src/platform/risk/drawdown-monitor-evaluators.ts` (199 LOC -> ~125 LOC)
   - Extract `src/platform/risk/drawdown-monitor-alerts-eval.ts`
   - Re-export for backward compatibility
   - Run vitest `src/platform/risk/__tests__/drawdown-monitor-eval-*.test.ts`

## Phase 2: Quantitative Trading Desks Implementation
1. **Desk 174: Turnbull-Wakeman (1991) Arithmetic Asian Option Engine** (`src/desk/turnbullwakeman/`)
   - `turnbullwakeman-types.ts`
   - `turnbullwakeman-math.ts`
   - `turnbullwakeman-engine.ts`
   - `index.ts`
2. **Desk 175: Hull-White (1990) Analytical Short-Rate & Bond Option Engine** (`src/desk/hullwhite/`)
   - `hullwhite-types.ts`
   - `hullwhite-engine.ts`
   - `index.ts`
3. **Desk 176: Garman-Klass (1980) & Parkinson (1980) Range Volatility Engine** (`src/desk/garmanklass/`)
   - `garmanklass-types.ts`
   - `garmanklass-engine.ts`
   - `index.ts`

## Phase 3: Testing & Quality Verification
- Create Vitest suites:
  - `tests/unit/desk/turnbullwakeman/turnbullwakeman-suite.test.ts`
  - `tests/unit/desk/hullwhite/hullwhite-suite.test.ts`
  - `tests/unit/desk/garmanklass/garmanklass-suite.test.ts`
- Run typecheck `tsc --noEmit`
- Run Quality Ratchet check `node scripts/check-quality-baseline.mjs --quality`
- Merge into `main`
