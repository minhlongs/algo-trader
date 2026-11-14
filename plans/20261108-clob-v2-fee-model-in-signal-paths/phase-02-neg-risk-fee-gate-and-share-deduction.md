---
title: "Phase 2 — Taker-BUY Share-Deduction Parity Guard & Negative-Risk V2 Fee Gate"
date: 2026-11-08
status: completed
phase: 2
tdd: true
---

# Phase 2: Taker-BUY Share-Deduction Parity Guard & Negative-Risk V2 Fee Gate

## 1. Goal

Model the Polymarket CLOB V2 Taker-BUY share-deduction asymmetry (where buying `C` shares as Taker deducts the fee directly in outcome tokens, delivering `C * (1 - feeRate)` net shares so buying 100 YES + 100 NO yields `< 100` mergeable pairs) and update `negative-risk-entry.ts` so that:
1. It classifies the market category via `classifyMarketCategory(market.question ?? market.slug ?? '')`.
2. It evaluates post-fee net mergeable payout (`netMergeableShares * 1.00 - totalNotionalUsdc`) and skips any opportunity where `totalCostWithFees >= runtime.cfg.threshold` or `netExpectedProfitUsdc <= (runtime.cfg.minNetEdgeUsdc ?? 0)`.
3. It computes and emits real V2 quadratic fees (`yesFeeUsdc.toFixed(6)` and `noFeeUsdc.toFixed(6)`) on both `trade.executed` events instead of hardcoded `fees: '0'`.

## 2. Owned Files

| File | Action | Current LOC | Target LOC |
|---|---|---|---|
| `src/desk/polymarket/polymarket-fee-calculator.ts` | MODIFY (add `computeTakerBuyNetSharesAndMergeablePairs` helper) | ~120 (after Phase 1) | ~160 |
| `src/desk/strategies/polymarket/negative-risk-types.ts` | MODIFY (add optional `minNetEdgeUsdc?: number` to `NegativeRiskScannerConfig`) | 98 | ~102 |
| `src/desk/strategies/polymarket/negative-risk-entry.ts` | MODIFY (enforce V2 post-fee edge gate, share-deduction check, and emit real V2 fees) | 138 | ~168 |
| `src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts` | MODIFY (update & expand tests for post-fee gate, share-deduction parity, and non-zero fee emission) | 155 | ~195 |

## 3. Step-by-Step TDD Tasks

### Task 2.1 (RED): Write failing tests for share-deduction parity and negative-risk fee gating
- In `tests/polymarket/polymarket-v2-fee-cutover.test.ts`, add tests for `computeTakerBuyNetSharesAndMergeablePairs(100, 0.48, 0.49, 'crypto')`:
  - Verify `yesNetShares < 100` and `noNetShares < 100`.
  - Verify `mergeablePairs === Math.min(yesNetShares, noNetShares) < 100` and `canMergeFullRequestedPairs === false`.
  - Verify `'geopolitics'` (0% fee) yields `mergeablePairs === 100` and `canMergeFullRequestedPairs === true`.
- In `src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts`:
  - **The `makeMarket()` mock sets no `question`/`slug`, so `classifyMarketCategory(' ') === 'politics'` — a test written with crypto arithmetic never exercises the production path it claims to gate.** The new skip test MUST set `question: 'Will Bitcoin close above $100k?'` (or any crypto-classifying string) on its market so the classifier actually returns `'crypto'`.
  - Add test: skips a market where raw `yesAsk + noAsk = 0.975 < 0.98` (passes legacy check) but after CLOB V2 crypto taker fees (`1.75%` per leg) `effectivePairCost = 0.4875/(1-0.01719) × 2 = 0.99422 >= 0.98`, so entry is skipped.
  - Add test: pins the existing "places both legs" case as a regression boundary — that mock classifies `politics`, `effectivePairCost = 0.48/(1-0.009984) × 2 = 0.969681 < 0.98`, net `~0.0303` per pair, so **both legs still fire** and the existing assertion at line ~131 needs no rewrite.
  - Add test: verifies `trade.executed` events emit non-zero `fees` strings matching CLOB V2 quadratic fees for fee-bearing markets, and `'0.000000'` only for fee-exempt (`geopolitics`) markets.

### Task 2.2 (GREEN): Implement `computeTakerBuyNetSharesAndMergeablePairs` in `polymarket-fee-calculator.ts`
- Export `TakerBuyParityBreakdown` interface and `computeTakerBuyNetSharesAndMergeablePairs(requestedPairs: number, yesAsk: number, noAsk: number, category: PolymarketCategory)`:
  - `yesFeeRate = calcQuadraticTakerFeeRateV2(category, yesAsk, false)`
  - `noFeeRate = calcQuadraticTakerFeeRateV2(category, noAsk, false)`
  - `yesNetShares = requestedPairs * (1 - yesFeeRate)`
  - `noNetShares = requestedPairs * (1 - noFeeRate)`
  - `mergeablePairs = Math.min(yesNetShares, noNetShares)`
  - `grossUpYesShares = yesFeeRate < 1 ? Math.ceil(requestedPairs / (1 - yesFeeRate)) : Infinity`
  - `grossUpNoShares = noFeeRate < 1 ? Math.ceil(requestedPairs / (1 - noFeeRate)) : Infinity`
  - `canMergeFullRequestedPairs = mergeablePairs >= requestedPairs - 1e-9`

### Task 2.3 (GREEN): Enforce V2 fee gate and emit real V2 fees in `negative-risk-entry.ts`
> **Per-leg share counts (verified):** `usdcToTokens` (`order-book-utils.ts:23-26`) returns `Math.round(usdc / price)`, so legs get *unequal* integer share counts whenever `yesAsk !== noAsk` (e.g. `$10 @ 0.48 → 21` shares vs `$10 @ 0.49 → 20`). The helper takes a single `requestedPairs`, so the caller must pass the **rounded, per-leg count** it actually ordered — not the raw USDC figure. Compute fees against the rounded tokens (`calcQuadraticTakerFeeV2(cat, ask, yesSizeTokens) * ask`) so the emitted fee string matches the executed notional.
- Classify `category = classifyMarketCategory(`${market.question ?? ''} ${market.slug ?? ''}`)`
- Compute per-unit V2 fee rates `yesFeeRate = calcQuadraticTakerFeeRateV2(category, yesAsk)` and `noFeeRate = calcQuadraticTakerFeeRateV2(category, noAsk)`.
- Compute effective cost per mergeable pair accounting for share deduction: `effectivePairCost = yesAsk / (1 - yesFeeRate) + noAsk / (1 - noFeeRate)`.
- Gate entry on `effectivePairCost >= runtime.cfg.threshold` (in addition to raw `totalCost >= runtime.cfg.threshold`) and `netExpectedProfitUsdc <= (runtime.cfg.minNetEdgeUsdc ?? 0)`.
- Compute `yesFeeUsdc = calcQuadraticTakerFeeV2(category, yesAsk, yesSizeTokens) * yesAsk` and `noFeeUsdc = calcQuadraticTakerFeeV2(category, noAsk, noSizeTokens) * noAsk` and emit `fees: yesFeeUsdc.toFixed(6)` / `fees: noFeeUsdc.toFixed(6)` in `trade.executed`.

## 4. Verification Commands

```bash
npx vitest run src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts tests/polymarket/polymarket-v2-fee-cutover.test.ts
npm run typecheck
npm run check:leaderboard
node -e "import('./scripts/oversized-file-check.mjs').then(m => { const c = m.collectFileLineCounts('.'); const over = c.filter(x => x.lines > 200); console.log('Over 200 LOC:', over.length); if (over.length) process.exit(1); })"
```
