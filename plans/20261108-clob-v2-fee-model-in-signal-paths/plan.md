---
title: "CLOB V2 Fee Model in Signal & Paper Paths + Share-Deduction Parity Guard"
date: 2026-11-08
status: completed
mode: fast
tdd: true
capital_context: "$100 micro-pilot (user-confirmed)"
---

# Plan: CLOB V2 Fee Model in Signal & Paper Paths (Stage 1 of PDF Advisory)

## 1. Objective & Capital Context

Replace the legacy linear `calcTakerFee` curve with the CLOB V2 quadratic fee engine across all live signal-generation and paper-simulation paths, close the `fees: '0'` unhedged-fee hole in `negative-risk-entry.ts`, and model the Taker-BUY share-deduction asymmetry so a parity/merge check refuses when net received pairs fall below requested pairs.

**Capital note ($100 micro-pilot):** With a $100 pilot, the PDF's institutional governance gates (4-week 95% bootstrap CI on doubled slippage, $7,500 per-market exposure cap, 60-day multi-regime sample) are **statistically under-powered** — at $5–$10 per leg and Polymarket's 5-share limit minimum (`minLimitOrderSharesMicro = 5_000_000`), a $100 book holds at most 5–10 concurrent positions and cannot separate skill from variance on Sharpe/Sortino. The NO-GO gates that *do* remain valid at $100 are **mechanical, per-trade invariants**:
1. Zero entries with negative net expected edge after V2 fee + share-deduction (`netExpectedProfitUsdc <= 0` → hard skip).
2. Zero unhedged single-leg exposure left open on leg-2 failure.
3. Sim-to-paper fee accounting drift = `0` micro-units.

## 2. Scope Boundary

**In scope (5 tasks across 2 phases):**
- Extract category tables/classifier out of `polymarket-fee-calculator.ts` (currently 196/200 LOC) so adding `nfl_college_football` (`rCat = 0.03`, `makerRebatePct = 0.15`) and `table_tennis` (`rCat = 0.10`, `makerRebatePct = 0.15`) keeps every file `<= 200` LOC.
- Switch `paper-orderbook-simulator.ts`, `live-order-manager-proxy.ts`, `arbitrage/profitability/fee-calculator.ts`, `polymarket-oos-arb-episode-simulator.ts`, and `polymarket-oos-maker-episode-simulator.ts` from `calcTakerFee` to `calcQuadraticTakerFeeRateV2` / `calcMakerRebateV2` (retaining `calcTakerFee` exported in `polymarket-fee-calculator.ts` so `tests/polymarket/polymarket-fee-calculator.test.ts` keeps asserting the legacy curve — `scripts/check-leaderboard-drift.mjs` contains no fee logic, so the leaderboard gate is unaffected either way).
- Add a pure helper `computeTakerBuyNetSharesAndMergeablePairs(requestedShares, yesAsk, noAsk, category)` that models Taker-BUY fee deduction in shares and returns `mergeablePairs < requestedShares`.
- Update `negative-risk-entry.ts` to: (a) classify the market category, (b) compute V2 taker fees and net mergeable payout before entry, (c) skip when `netPayoutAfterFee - totalCost <= minNetEdge` (default `0`), and (d) emit actual V2 fees on `trade.executed` instead of hardcoded `'0'`.

**Out of scope:** external repo integrations (`nautilus_trader`, `py-sdk`, `poly-maker`, `pmxt`, `Follow-SM`), Bregman/KL-projection engine, new AI agents, new risk gate rules, enabling `LIVE_TRADING_ENABLED`.

## 3. Phases

| Phase | File | Focus | Status |
|---|---|---|---|
| Phase 1 | `phase-01-v2-categories-and-simulator-cutover.md` | Modularize fee categories (`<=200` LOC), add `nfl_college_football` & `table_tennis`, cut over paper simulator, proxy, profitability & OOS simulators to V2 quadratic fees | completed |
| Phase 2 | `phase-02-neg-risk-fee-gate-and-share-deduction.md` | Model Taker-BUY share-deduction parity loss; enforce V2 fee-adjusted threshold & real fee emission in `negative-risk-entry.ts` | completed |

**Branch:** `feat/clob-v2-fee-model-signal-paths` (create from `main` — the worktree is currently on `docs/correct-oversized-file-check-history`, which is not a feature branch).

## 4. Acceptance Criteria (Mechanical Verification)

1. `grep -rn "calcTakerFee(" src/ --include="*.ts" | grep -v "polymarket-fee-calculator.ts" | grep -v "__tests__"` returns **0 lines** (all runtime callers moved to `calcQuadraticTakerFeeRateV2`).
2. `calcQuadraticTakerFeeRateV2('nfl_college_football', 0.5) === 0.0075` and `calcQuadraticTakerFeeRateV2('table_tennis', 0.5) === 0.025`.
3. Buying 100 YES + 100 NO via Taker in a fee-bearing category yields `mergeablePairs < 100`, and `canMergeFullRequestedPairs` returns `false`.
4. `negative-risk-entry.ts` contains **zero** occurrences of `fees: '0'`, skips a **crypto-classified** opportunity where `yesAsk + noAsk = 0.975 < 0.98` before fees but `effectivePairCost = 0.99422 >= 0.98` after V2 fees (the default `politics` classification at asks of 0.48 grosses up only to `0.969681 < 0.98` and still trades — that boundary is pinned as a separate regression test), and emits non-zero fee strings for fee-bearing markets / `'0.000000'` only for exempt (`geopolitics`) markets.
5. Every touched `.ts` file in `src/` and `tests/` is `<= 200` LOC (quality gate `quality.maxFileSizeLines = 200`, enforced by `scripts/oversized-file-check.mjs` against the `quality-baseline.json` snapshot — currently `count: 0`).
6. Focused unit tests, `npm run check:leaderboard`, and `npm run typecheck` pass with 0 errors.
7. **Regression guard:** `calcTakerFee` and `calcMakerRebate` stay exported in `polymarket-fee-calculator.ts` — `tests/polymarket/polymarket-fee-calculator.test.ts` and the `check:leaderboard` 30/30 suite still assert the legacy curve.
