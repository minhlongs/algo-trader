---
title: "Phase 1 — CLOB V2 Categories, Modular Extraction, and Simulator Cutover"
date: 2026-11-08
status: completed
phase: 1
tdd: true
---

# Phase 1: CLOB V2 Categories, Modular Extraction, and Simulator Cutover

## 1. Goal

Extract Polymarket fee category schedules and keyword classification into a dedicated module (`src/desk/polymarket/polymarket-clob-v2-fee-categories.ts`) so every file stays `<= 200` LOC, add the two missing November 2026 categories from the PDF (`nfl_college_football` at `rCat = 0.03`, `makerRebatePct = 0.15`; `table_tennis` at `rCat = 0.10`, `makerRebatePct = 0.15`), and replace all runtime calls to legacy `calcTakerFee` / `calcMakerRebate` in paper simulation, order-manager proxy, profitability evaluation, and OOS walk-forward simulators with `calcQuadraticTakerFeeRateV2` / `calcMakerRebateV2`.

## 2. Owned Files

| File | Action | Current LOC | Target LOC |
|---|---|---|---|
| `src/desk/polymarket/polymarket-clob-v2-fee-categories.ts` | CREATE | 0 | ~95 |
| `src/desk/polymarket/polymarket-fee-calculator.ts` | MODIFY (re-export categories, keep `<= 200` LOC) | 196 | ~120 |
| `src/desk/polymarket/paper-orderbook-simulator.ts` | MODIFY (replace `calcTakerFee` with `calcQuadraticTakerFeeRateV2`, optional `category`) | 182 | ~186 |
| `src/desk/polymarket/live-order-manager-proxy.ts` | MODIFY (replace `calcTakerFee` with `calcQuadraticTakerFeeRateV2`, optional `category`) | 142 | ~146 |
| `src/desk/arbitrage/profitability/fee-calculator.ts` | MODIFY (switch to `calcQuadraticTakerFeeRateV2` + `CLOB_V2_QUADRATIC_RATES`) | 67 | ~68 |
| `src/desk/polymarket/polymarket-oos-arb-episode-simulator.ts` | MODIFY (switch to `calcQuadraticTakerFeeRateV2`) | 68 | ~68 |
| `src/desk/polymarket/polymarket-oos-maker-episode-simulator.ts` | MODIFY (switch unwind fee to `calcQuadraticTakerFeeRateV2`) | 90 | ~90 |
| `tests/polymarket/polymarket-v2-fee-cutover.test.ts` | CREATE (TDD suite for Phase 1) | 0 | ~150 |
| `tests/desk/arbitrage/m1-connectors-profitability.test.ts` | MODIFY (tests 3.2/3.3 assert the legacy curve through the cutover `calculatePolymarketFee`) | ~1010 | ~1012 |
| `tests/desk/arbitrage/m1-challenger-stress.test.ts` | MODIFY (test 3.5 asserts the legacy `finance` maker-rebate rate through the cutover `calculateLegFee`) | ~440 | ~442 |

## 3. Step-by-Step TDD Tasks

### Task 1.1 (RED): Write failing tests in `tests/polymarket/polymarket-v2-fee-cutover.test.ts`
- Assert `calcQuadraticTakerFeeRateV2('nfl_college_football', 0.50)` equals `0.0075` ($0.75 per 100 shares at $0.50) and `calcMakerRebateV2('nfl_college_football', 0.50, 100)` equals `0.1125` (15% rebate pool).
- Assert `calcQuadraticTakerFeeRateV2('table_tennis', 0.50)` equals `0.025` ($2.50 per 100 shares at $0.50) and `calcQuadraticTakerFeeRateV2('table_tennis', 0.10)` equals `0.009` ($0.90 per 100 shares at $0.10).
- Assert `classifyMarketCategory('NFL Chiefs vs Bills college football NCAAF') === 'nfl_college_football'` and `classifyMarketCategory('WTT table tennis ping pong finals') === 'table_tennis'`.
- Assert `sweepOrderBookLevels` computes the V2 quadratic fee and respects an explicit `category` argument:
  - Note the fee convention: the simulator multiplies `rate * filledSize * price`, so for `'crypto'` at `p = 0.50`, `size = 100` the rate is `0.07 * 0.5 * 0.5 = 0.0175` and the simulator reports `0.0175 * 100 * 0.5 = 0.875` USDC (the legacy code reported `0.0035 * 50 = 0.175` USDC).
  - `'geopolitics'` → `feeUsdc === 0`.
  - Default category stays `'politics'` so the existing single caller in `live-trading-adapter-setup.ts:113` needs no edit.
- Assert `calculatePolymarketFee('crypto', 0.50, 1000)` uses the V2 quadratic rate: `rate === 0.0175` and `feeUsd === 17.50` — which agrees with `calcQuadraticTakerFeeV2('crypto', 0.50, 1000) === 17.50` (the helper returns `contracts * rate`, i.e. pUSD, **not** `contracts * rate * price`), while `rebateUsd` becomes the 20% V2 rebate pool of `$17.50` = `$3.50`. The signature is `(category, probability, notionalUsd)` — there is **no `postOnly`/maker parameter** on this function, so do not pass one (the maker branch lives in `calculateLegFee`).

### Task 1.2 (GREEN): Extract `polymarket-clob-v2-fee-categories.ts` & add new categories
> **Ordering note (verified):** `calcQuadraticTakerFeeRateV2` destructures `{ rCat } = CLOB_V2_QUADRATIC_RATES[category]`, so it **throws `TypeError`** for a category not yet in the table. The Task 1.1 RED suite therefore *errors* rather than *fails* until both new categories are registered in `CLOB_V2_QUADRATIC_RATES`. Land the table additions of Task 1.2 first (a one-line insert per category), confirm the RED suite now fails with clean assertion errors, then write the assertions. This avoids mistaking a `TypeError` for a real RED gate.
- Move `PolymarketCategory`, `FeeSchedule`, `CLOB_V2_MAX_BASE_FEE_BPS`, `CLOB_V2_QUADRATIC_RATES`, `FEE_SCHEDULES`, `CATEGORY_KEYWORDS`, and `classifyMarketCategory` to `src/desk/polymarket/polymarket-clob-v2-fee-categories.ts`.
- Add `'nfl_college_football'` (`rCat: 0.03, makerRebatePct: 0.15`) and `'table_tennis'` (`rCat: 0.10, makerRebatePct: 0.15`) to `PolymarketCategory`, `CLOB_V2_QUADRATIC_RATES`, `FEE_SCHEDULES`, and `CATEGORY_KEYWORDS`.
  - **Rebate attribution:** `nfl_college_football`'s `0.15` is sourced from the PDF (15% maker-rebate pool, same as Sports). `table_tennis`'s `0.15` is an **assumed placeholder** — the PDF states the table-tennis rebate as "Theo quy định danh mục" (category-defined) with no percentage. Mark the value in the moved table with a short comment naming it as an assumption to reconcile with the live Polymarket fee schedule before any live sizing depends on it. Note `makerRebatePct` only affects maker routing, not taker entries, so mis-stating it does not change this plan's taker-side gates.
  - **Do NOT remove `'finals'` from the generic `'sports'` keyword list.** `tests/polymarket/polymarket-fee-calculator.test.ts:98` asserts `classifyMarketCategory('NBA Finals champion 2026') === 'sports'`, and the classifier is a highest-score-wins contest — a new category only wins when its own keywords outscore the incumbent.
  - New `'nfl_college_football'` keywords: `'nfl'`, `'ncaaf'`, `'college football'`, `'cfb'`, `'super bowl'`. Remove `'nfl'` from the `'sports'` list only (it stays `['nba','mlb','champion','playoff','world cup','super bowl','finals','match']` minus `'nfl'`).
  - New `'table_tennis'` keywords: `'table tennis'`, `'ping pong'`, `'wtt'`, `'ittf'`.
  - `tests/polymarket/polymarket-fee-calculator.test.ts` `has all 10 categories` needs no change — it only asserts the existing 10 are defined, so extra categories are additive.
- Re-export all moved symbols from `polymarket-fee-calculator.ts` so every existing import path remains 100% source-compatible.
- **Do NOT rewrite `netCostTaker` / `netProfitMaker`.** They have zero callers in `src/` (test-only: `tests/polymarket/polymarket-fee-calculator.test.ts:60-84`), so switching them to V2 would change no production behavior while breaking four existing assertions (`1000 * 1.0035`, finance `110`, finance `150`) for no gain. Leave them on the legacy curve; this keeps Acceptance Criterion 7 (legacy curve still asserted) intact.

### Task 1.3 (GREEN): Cut over paper simulator, proxy, profitability, and OOS simulators
- In `paper-orderbook-simulator.ts`: replace `calcTakerFee('politics', ...)` at lines 60 and 96 with `calcQuadraticTakerFeeRateV2(category, ...)`, adding optional `category: PolymarketCategory = 'politics'` to `sweepOrderBookLevels`.
- In `live-order-manager-proxy.ts`: replace `calcTakerFee('politics', fillPriceNum)` at line 84 with `calcQuadraticTakerFeeRateV2(category, fillPriceNum)` (resolving category via optional `params.category ?? 'politics'`).
- In `src/desk/arbitrage/profitability/fee-calculator.ts`: replace `calcTakerFee` and `FEE_SCHEDULES` with `calcQuadraticTakerFeeRateV2` and `CLOB_V2_QUADRATIC_RATES`.
- In `polymarket-oos-arb-episode-simulator.ts` and `polymarket-oos-maker-episode-simulator.ts`: replace `calcTakerFee` with `calcQuadraticTakerFeeRateV2`.

## 4. Verification Commands

```bash
npx vitest run tests/polymarket/polymarket-v2-fee-cutover.test.ts tests/polymarket/polymarket-fee-calculator.test.ts tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts
```
