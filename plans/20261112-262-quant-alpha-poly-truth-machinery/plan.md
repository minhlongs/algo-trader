---
title: "Quant Alpha Polymarket: honest measurement machinery + 3 report strategies (paper mode)"
description: "Delete the inverted/hardcoded fee model in favour of the live Gamma feeSchedule, replace synthetic backtest price paths with point-in-time L2 replay, add queue-aware fills, walk-forward + block-bootstrap + deflated-Sharpe robustness, ship the report's three strategies, a fail-closed risk engine, and a kpi:poly command that prints all 11 governance KPIs with GO / NO-GO / CHUA DU DU LIEU."
status: completed
priority: P0
issue: 262
branch: feat/quant-alpha-poly-truth-machinery
tags: [polymarket, fees, l2-replay, backtest, walk-forward, deflated-sharpe, kpi, paper-trading]
created: 2026-11-12
---

# Plan: Quant Alpha Polymarket — truth machinery (issue #262)

## Contract (locked at gate 1, do not edit silently)

| Field | Locked value |
|---|---|
| Deliverable | Code running inside `algo-trader` in **paper mode** |
| Scope | **Whole report**: foundation + 3 strategies |
| Data | **Self-recorded L2 point-in-time + retroactive real data**, labelled by source |
| Done means | Machinery finished **and** the first real measurements: all 11 KPIs computed and printed with GO / NO-GO / NOT-ENOUGH-DATA. Explicitly *not* a profitability claim. |
| Out of scope | Real capital, `LIVE_TRADING_ENABLED`, production deploy, sending any order to the exchange |

## The two defects that invalidate every existing performance number

1. **Fee model is wrong twice over.** `polymarket-fee-calculator.ts` uses an *inverted, linear* curve (fee lowest at p=0.50, highest at the extremes) with a hardcoded table; the live exchange charges `rate × p × (1−p)`, which peaks at p=0.50. Separately, every fill site hardcodes the category `'politics'`.
   Live survey of the top 400 open markets (2026-11-12, Gamma API) — `feeSchedule.rate`: crypto `0.07` (rebate 0.20), sports/other `0.05` (0.15–0.25), politics/finance/tech `0.04` (0.25), n=3 at `0.03`, geopolitics `feesEnabled=false` (exempt). All `takerOnly: true`, `exponent: 1`.
   Consequence: at p=0.50 crypto is understated **8.75×** (0.35% modelled vs 1.75% real).
   A third variant of the same defect: the production arbitrage path `ingestion-evaluator.ts` passes neither a category nor a description, so `calculateLegFee` silently prices **every** Polymarket leg at its `'crypto'` fallback. Five fee surfaces in total, none of them reading the exchange.

2. **Backtest prices are drawn by the code.** `gamma-historical-provider.ts` fetches only the market *list*; every tick comes from `simulatePriceEvolution`, and `backtest-price-regimes.ts` hardcodes paths reverse-engineered to fire specific strategies. The repo's "30/30 round-trips" were measured on self-drawn prices.

## Phases and file ownership

Ownership is disjoint by construction so phases can run in parallel worktrees.

| Phase | Name | Depends on | File ownership |
|---|---|---|---|
| 1 | Fee truth: live `feeSchedule`, no hardcoded category | — | `src/desk/polymarket/polymarket-fee-calculator.ts`, `src/desk/polymarket/fee-schedule-resolver.ts` (new), `src/desk/arbitrage/profitability/fee-calculator.ts`, `src/desk/arbitrage/profitability/profitability-types.ts`, `src/desk/arbitrage/profitability/profitability-evaluator.ts`, `src/desk/arbitrage/profitability/profitability-decision-engine.ts`, `src/desk/arbitrage/net-profitability-calculator.ts`, `src/desk/arbitrage/ingestion/ingestion-evaluator.ts`, `tests/polymarket/polymarket-fee-calculator.test.ts`, `tests/polymarket/fee-schedule-resolver.test.ts` (new), `tests/desk/arbitrage/m1-connectors-profitability.test.ts`, `tests/desk/arbitrage/m1-challenger-stress.test.ts` |
| 2 | Point-in-time L2 recorder + retroactive collector | — | `src/desk/polymarket/l2/*` (new), `src/desk/polymarket/real-trade-ledger.ts`, `src/desk/polymarket/polymarket-data-api-client.ts` (new), `tests/polymarket/l2/*` |
| 3 | Queue-aware fill simulator + V2 execution surface | 1 | `src/desk/polymarket/queue-aware-fill-simulator.ts` (new), `src/desk/polymarket/paper-orderbook-simulator.ts`, `src/desk/polymarket/live-trading-adapter-setup.ts`, `src/desk/polymarket/live-order-manager-proxy.ts`, `src/desk/polymarket/polymarket-oos-evaluator.ts`, `src/desk/polymarket/clob-v2-order-surface.ts` (new) |
| 4 | Robustness metrics: walk-forward, block bootstrap, deflated Sharpe | — | `src/desk/backtesting/walk-forward-splitter.ts`, `src/desk/backtesting/stationary-block-bootstrap.ts`, `src/desk/backtesting/deflated-sharpe.ts`, `src/desk/backtesting/liquidity-regimes.ts` (all new), `src/desk/backtesting/metrics-calculator.ts`, `tests/desk/backtesting/*` |
| 5 | The report's three strategies | 1, 3, 4 | `src/desk/strategies/polymarket/quant-alpha/*` (new) |
| 6 | Fail-closed risk engine + kill switch | — | `src/desk/risk/poly-fail-closed-risk-engine.ts`, `src/desk/risk/poly-kill-switch.ts` (new), `tests/risk/poly-*` |
| 7 | Real backtest wiring (kill synthetic paths) + `kpi:poly` | 1–6 | `src/desk/backtesting/gamma-historical-provider.ts`, `src/desk/backtesting/backtest-price-regimes.ts`, `src/desk/cli/kpi-poly-*` (new), `scripts/kpi-poly.ts` (new), `package.json` |

## Shared interface contract (agreed once, everyone codes against it)

```ts
// src/desk/polymarket/polymarket-fee-calculator.ts  (phase 1)
export interface PolymarketFeeSchedule {
  exponent: number;   // live: 1
  rate: number;       // live: 0.07 | 0.05 | 0.04 | 0.03
  takerOnly: boolean; // live: true
  rebateRate: number; // live: 0.15 | 0.20 | 0.25
}
export const EXEMPT_FEE_SCHEDULE: PolymarketFeeSchedule; // rate 0, feesEnabled false
/** Fee in USDC per share for a taker fill at `price`. rate * (p*(1-p))^exponent */
export function calcTakerFeePerShare(schedule: PolymarketFeeSchedule, price: number): number;
export function calcMakerRebatePerShare(schedule: PolymarketFeeSchedule, price: number): number;
```

```ts
// src/desk/polymarket/fee-schedule-resolver.ts  (phase 1)
export interface FeeScheduleResolver {
  /** null => market has feesEnabled=false (exempt). Throws only on transport failure. */
  resolve(tokenId: string): Promise<PolymarketFeeSchedule | null>;
}
export function createGammaFeeScheduleResolver(opts?: { ttlMs?: number; fetchImpl?: typeof fetch }): FeeScheduleResolver;
```

Phase 3 and 5 consume `FeeScheduleResolver`; they must never call `calcTakerFee(category, p)`.

## Acceptance criteria (Done means)

1. `calcTakerFeePerShare({rate:0.07,...}, 0.50)` = `0.0175`; at p=0.10 and p=0.90 identical; at p=0.01 strictly smaller. Exempt schedule → 0.
2. Zero occurrences of the literal `'politics'` as a fee category in `src/desk/polymarket/**` and `src/desk/arbitrage/**`.
3. Every fill path that can reach a ledger obtains its schedule from a market/token, not from a keyword.
4. L2 recorder writes timestamped, replayable JSONL; replay produces a book sequence identical to what was recorded, and every row carries a `source` label (`recorded-l2` | `data-api-v2` | `prices-history`).
5. Fill simulator implements back-of-queue, 15–25% cancel-volume deduction, log-normal cancel latency (median 35 ms / p99 180 ms) and the +150 ms crypto taker delay; unit tests pin each.
6. Walk-forward splits train/calibrate/test with 4 liquidity regimes; → Stationary Block Bootstrap 95% CI; → Deflated Sharpe.
7. The three strategies exist, are registered, and are parameterised — not hardcoded to fire on synthetic ticks.
8. Risk engine is fail-closed: any unresolved state blocks the order; kill switch issues `DELETE /cancel-all`.
9. `npm run kpi:poly` prints 11 KPIs, each with a numeric value (or `NOT ENOUGH DATA`), its threshold, and `GO` / `NO-GO` / `NOT ENOUGH DATA`.
10. `tsc --noEmit` 0 errors, tests green, every touched `.ts` ≤ 200 LOC, no `:any`, no `console.log`.
11. `simulateMarketRegimeTick` can no longer feed any KPI — it is either removed from the KPI path or guarded by a source label that the KPI layer rejects.

## Rollback

All work is additive or in-place behind existing call signatures; revert the merge commit. No schema, no remote state, no env var changed.

## Risks

- **Credentials absent** (`POLY_PRIVATE_KEY`, API key/secret/passphrase). CLOB V2 signing therefore ships unit-tested against a fake key and is reported as *not verified against the live endpoint*.
- 45–60 min of live L2 capture is the minimum to prove the record→replay pipeline; that is a *pipeline proof*, not a statistically significant sample. The KPI layer must print `NOT ENOUGH DATA` where the sample is short — that is the honest outcome, not a failure.
