---
title: "Phase 1 — CLOB V2 Maker Quote Economics, Cycle-End Sniper V2 Fees, and Strategy Fee Accounting"
phase: 1
status: completed
tdd: true
---

# Phase 1: CLOB V2 Maker Quote Economics, Cycle-End Sniper V2 Fees, and Strategy Fee Accounting

## 1. Files Owned

- `src/desk/strategies/polymarket/market-maker-math.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/market-maker.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/inventory-skew-concentration.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/inventory-skew-rebalance.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/multi-leg-hedge-entries.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/multi-leg-hedge-exits.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/price-impact-estimator-entries.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/price-impact-estimator-exits.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/cycle-end-sniper-math.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/cycle-end-sniper.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/market-maker.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/market-maker-class.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/cycle-end-sniper.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/multi-leg-hedge.test.ts` (`<= 200` LOC)
- `src/desk/strategies/polymarket/__tests__/price-impact-estimator.test.ts` (`<= 200` LOC)

## 2. Step-by-Step Tasks (TDD)

1. **Red:** Add unit tests in `src/desk/strategies/polymarket/__tests__/` asserting:
   - `computeMakerQuoteEconomicsV2(0.49, 0.51, 25, 'crypto')` computes positive `bidRebateUsdc`, `askRebateUsdc`, `avoidedTakerFeeUsdc`, and `netMakerEdgeUsdc > grossSpreadUsdc`, while `geopolitics` (0% fee) has `0` rebates and `0` avoided taker fees.
   - `MarketMakerStrategy` stores `lastEconomics` and accumulates `makerRebateUsdc` and `avoidedTakerFeeUsdc` on bid/ask fills.
   - `runConcentrationCheck`, `runRebalance`, `scanEntriesFor`, `checkExitsFor`, `scanPriceImpactEntries`, and `checkPriceImpactExits` emit real CLOB V2 quadratic taker fees (`fees !== '0'`) on fee-bearing markets.
   - `computeSnipeExpectedProfitV2(0.96, 'crypto')` and `evaluateSnipeMarket(..., now, { useClobV2Fees: true, category: 'crypto' })` compute CLOB V2 share-deduction net profit `(1 - feeRate) - entryPrice` instead of subtracting flat 2%.
2. **Green:** Implement `computeMakerQuoteEconomicsV2`, `MarketMakerStrategy` economics tracking, CLOB V2 fees across all 6 strategy execution modules, and `computeSnipeExpectedProfitV2` in `cycle-end-sniper-math.ts`.
3. **Verify:** Run unit tests, `grep -rn "fees: '0'" src/desk/strategies/polymarket/`, `node scripts/oversized-file-check.mjs`, `npm run check:leaderboard`, and `npm run typecheck`.
