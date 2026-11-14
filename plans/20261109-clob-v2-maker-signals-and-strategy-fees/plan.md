---
title: "CLOB V2 Maker Quote Economics, Cycle-End Sniper V2 Fees, and Polymarket Strategy Fee Accounting"
date: 2026-11-09
status: completed
mode: fast
tdd: true
capital_context: "$100 micro-pilot (user-confirmed)"
---

# Plan: CLOB V2 Maker Quote Economics, Cycle-End Sniper V2 Fees, and Polymarket Strategy Fee Accounting

## 1. Objective & Capital Context

Complete the remaining items in the confirmed POLY-ALPHA-HUNTER-V4 Handoff Brief:
1. Wire `calcQuadraticTakerFeeV2` and `calcMakerRebateV2` into live/paper maker signal generation (`src/desk/strategies/polymarket/market-maker-math.ts` and `src/desk/strategies/polymarket/market-maker.ts`) so maker quote evaluation and fill tracking compute CLOB V2 maker rebates and avoided quadratic taker fees (not only OOS).
2. Replace all 6 remaining hardcoded `fees: '0'` in `src/desk/strategies/polymarket/` (`inventory-skew-concentration.ts`, `inventory-skew-rebalance.ts`, `multi-leg-hedge-entries.ts`, `multi-leg-hedge-exits.ts`, `price-impact-estimator-entries.ts`, `price-impact-estimator-exits.ts`) with CLOB V2 quadratic taker fees (`calcQuadraticTakerFeeV2` + `classifyMarketCategory`).
3. Add `computeSnipeExpectedProfitV2` and optional `useClobV2Fees` to `src/desk/strategies/polymarket/cycle-end-sniper-math.ts` and `src/desk/strategies/polymarket/cycle-end-sniper.ts` so cycle-end sniper signals support CLOB V2 share-deduction fee rates while keeping default legacy behavior backwards-compatible.

## 2. Scope Boundary

**In scope:**
- `src/desk/strategies/polymarket/market-maker-math.ts` & `src/desk/strategies/polymarket/market-maker.ts`
- `src/desk/strategies/polymarket/inventory-skew-concentration.ts` & `src/desk/strategies/polymarket/inventory-skew-rebalance.ts`
- `src/desk/strategies/polymarket/multi-leg-hedge-entries.ts` & `src/desk/strategies/polymarket/multi-leg-hedge-exits.ts`
- `src/desk/strategies/polymarket/price-impact-estimator-entries.ts` & `src/desk/strategies/polymarket/price-impact-estimator-exits.ts`
- `src/desk/strategies/polymarket/cycle-end-sniper-math.ts` & `src/desk/strategies/polymarket/cycle-end-sniper.ts`
- Corresponding unit tests in `src/desk/strategies/polymarket/__tests__/`.

**Out of scope:** external repo integrations, Bregman/KL-projection engine, new AI agents, new pre-trade risk gate contracts, enabling `LIVE_TRADING_ENABLED`.

## 3. Phases

| Phase | File | Focus | Status |
|---|---|---|---|
| Phase 1 | `phase-01-maker-signals-and-strategy-v2-fees.md` | Wire CLOB V2 maker economics, cycle-end sniper V2 fees, and eliminate all remaining `fees: '0'` in polymarket strategies | completed |

**Branch:** `feat/clob-v2-maker-signals-and-strategy-fees`

## 4. Acceptance Criteria (Mechanical Verification)

1. `computeMakerQuoteEconomicsV2(bidPrice, askPrice, quoteSizeUsdc, category)` in `market-maker-math.ts` computes CLOB V2 maker rebates (`calcMakerRebateV2`) and avoided taker fees (`calcQuadraticTakerFeeV2`), and `MarketMakerStrategy` updates per-market quote economics and fill rebate totals during `executeTick()`.
2. `grep -rn "fees: '0'" src/desk/strategies/polymarket/` returns **zero** matches; all 6 strategy execution paths emit `order?.fees ?? feeUsdc.toFixed(6)` using `calcQuadraticTakerFeeV2`.
3. `computeSnipeExpectedProfitV2` and `evaluateSnipeMarket(..., { useClobV2Fees: true })` compute expected profit after CLOB V2 share-deduction (`(1 - feeRate) - entryPrice`).
4. Every `.ts` file in `src/` is `<= 200` LOC (`node scripts/oversized-file-check.mjs` passes with 0 violations).
5. Focused unit tests, `npm run check:leaderboard`, and `npm run typecheck` pass with 0 errors.
