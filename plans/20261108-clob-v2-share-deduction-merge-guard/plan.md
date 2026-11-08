---
title: "CLOB V2 Share-Deduction Merge Parity Guard & Negative-Risk Exit Fee Accounting"
date: 2026-11-08
status: completed
mode: fast
tdd: true
capital_context: "$100 micro-pilot (user-confirmed)"
---

# Plan: CLOB V2 Share-Deduction Merge Parity Guard & Negative-Risk Exit Fee Accounting

## 1. Objective & Capital Context

Wire the CLOB V2 Taker-BUY share-deduction parity guard (`computeTakerBuyNetSharesAndMergeablePairs`, `canMergeFullRequestedPairs`, `grossUpYesShares`, `grossUpNoShares`) into the split-merge execution helpers, negative-risk entry sizing/gating, and negative-risk exit fee accounting so that:
1. Buying `N` YES + `N` NO shares via Taker in a fee-bearing category is recognized as delivering `< N` complete mergeable pairs (`mergeablePairs = Math.min(yesNetShares, noNetShares) < N`), and attempting to merge the full `N` requested pairs without gross-up is **refused** (`allowed: false`, `reason: 'SHARE_DEDUCTION_SHORTFALL'`).
2. When grossed-up leg sizes (`grossUpYesShares`, `grossUpNoShares`) are filled, net received shares on both legs cover the full `N` requested pairs (`mergeablePairs >= N`, `allowed: true`).
3. `negative-risk-entry.ts` supports optional parity-restoring gross-up (`grossUpForShareDeduction?: boolean`) and `requireFullRequestedPairMerge?: boolean`, and records `category` on `ArbPosition` so `negative-risk-exit.ts` computes and emits real CLOB V2 taker fees instead of hardcoded `fees: '0'`.
4. Walk-forward OOS evaluation remains deterministic and continues to separate `executable_ask_fee_arb` from `naive_mid_arb`.

## 2. Scope Boundary

**In scope:**
- Add `TakerBuyMergeGuardDecision` and `evaluateTakerBuyMergeParity(requestedPairs, yesOrderShares, noOrderShares, yesAsk, noAsk, category)` in `src/desk/arbitrage/executors/split-merge-executor-helpers.ts`, plus `computeSplitMergePayoutV2` and optional `enforceClobV2MergeParity` in `SplitMergeArbitrageExecutor`.
- Extend `NegativeRiskScannerConfig` and `ArbPosition` in `src/desk/strategies/polymarket/negative-risk-types.ts` with optional `grossUpForShareDeduction?: boolean`, `requireFullRequestedPairMerge?: boolean`, and `category?: PolymarketCategory`.
- Wire `grossUpForShareDeduction` / `requireFullRequestedPairMerge` into `src/desk/strategies/polymarket/negative-risk-entry.ts` and replace hardcoded `fees: '0'` in `src/desk/strategies/polymarket/negative-risk-exit.ts` with CLOB V2 taker fee calculation (`calcQuadraticTakerFeeV2`).
- Add unit tests in `tests/unit/desk/arbitrage/executors/split-merge-executor.test.ts`, `src/desk/strategies/polymarket/__tests__/negative-risk-entry.test.ts`, and `src/desk/strategies/polymarket/__tests__/negative-risk-exit.test.ts`.

**Out of scope:** external repo integrations (`nautilus_trader`, `py-sdk`, `poly-maker`, `pmxt`, `Follow-SM`), Bregman/KL-projection engine, new AI agents, new pre-trade risk gate contracts, enabling `LIVE_TRADING_ENABLED`.

## 3. Phases

| Phase | File | Focus | Status |
|---|---|---|---|
| Phase 1 | `phase-01-share-deduction-merge-guard-and-exit-fees.md` | Add `evaluateTakerBuyMergeParity` & `computeSplitMergePayoutV2` in split-merge executor, wire parity guard & exit V2 fees in negative-risk scanner | completed |

**Branch:** `feat/clob-v2-share-deduction-merge-guard`

## 4. Acceptance Criteria (Mechanical Verification)

1. Buying 100 YES + 100 NO via Taker in a fee-bearing category (`crypto`, `politics`, `sports`, `nfl_college_football`, `table_tennis`) yields `mergeablePairs < 100`, and `evaluateTakerBuyMergeParity(100, 100, 100, yesAsk, noAsk, category)` returns `{ allowed: false, reason: 'SHARE_DEDUCTION_SHORTFALL' }`.
2. Passing `grossUpYesShares` and `grossUpNoShares` into `evaluateTakerBuyMergeParity(100, grossUpYesShares, grossUpNoShares, yesAsk, noAsk, category)` yields `mergeablePairs >= 100` and `{ allowed: true }`.
3. `SplitMergeArbitrageExecutor` with `{ enforceClobV2MergeParity: true }` refuses an un-grossed-up fee-bearing settlement-arb opportunity when leg amounts do not cover share deduction, and succeeds when leg amounts are grossed up or when the category is fee-exempt (`geopolitics`). Default `SplitMergeArbitrageExecutor` behavior remains 100% backwards-compatible.
4. `src/desk/strategies/polymarket/negative-risk-exit.ts` contains **zero** occurrences of `fees: '0'` and emits real CLOB V2 taker fees (`order.fees ?? feeUsdc.toFixed(6)`).
5. Every touched `.ts` file in `src/` and `tests/` is `<= 200` LOC (`node scripts/oversized-file-check.mjs` passes with `count: 0`).
6. Focused unit tests, `npm run check:leaderboard`, and `npm run typecheck` pass with 0 errors.
