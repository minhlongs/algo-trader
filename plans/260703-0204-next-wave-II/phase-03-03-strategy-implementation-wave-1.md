---
phase: 3
title: "Strategy Wave 2 — 8 Medium Strategies"
status: pending
priority: P1
dependencies: [1]
---

# Phase 3: Strategy Wave 2 — 8 Medium Strategies

## Overview

Fill in 8 medium-complexity strategy stubs with real logic. These use the `createXxxTick(deps: StrategyDeps)` factory pattern and are pre-registered in strategy-wiring.ts.

**Red-team findings applied:** Sequential dependency on Phase 1. Count corrected. Cross-platform and cross-market strategies noted as having unverified feed dependencies.

## Strategies

| Strategy | Type | Data Source | Status |
|----------|------|-------------|--------|
| Microstructure Alpha | Microstructure | Order book depth | Pre-registered stub |
| Order Flow Toxicity | Microstructure | Trade flow | Pre-registered stub |
| Correlation Breakdown | Correlation | Cross-market prices | Pre-registered stub |
| Pairs Stat Arb | Arbitrage | Spread between related markets | Pre-registered stub |
| Funding Rate Arb | Arbitrage | Perp funding rates | Pre-registered stub |
| Gamma Scalping | Options | Gamma exposure | Pre-registered stub |
| Kalman Filter Tracker | Signal Processing | Price series filtering | Pre-registered stub |
| Liquidation Cascade | Event-driven | On-chain liquidations | Pre-registered stub |

**Cross-platform basis and cross-market arb** — excluded from this wave. These depend on Kalshi/Limitless feed adapters that may not exist. Pending feed infrastructure audit (see open questions).

## Architecture

Same pattern as Phase 1 but may require additional data sources:
- Order book from `src/desk/polymarket/orderbook-stream.ts` (stub — needs verification)
- Market data from `src/desk/market-data/`
- On-chain data from existing event listeners

## Related Code Files

- Modify: `src/desk/strategies/polymarket/microstructure-alpha.ts`
- Modify: `src/desk/strategies/polymarket/order-flow-toxicity.ts`
- Modify: `src/desk/strategies/polymarket/correlation-breakdown.ts`
- Modify: `src/desk/strategies/polymarket/pairs-stat-arb.ts`
- Modify: `src/desk/strategies/polymarket/funding-rate-arb.ts`
- Modify: `src/desk/strategies/polymarket/gamma-scalping.ts`
- Modify: `src/desk/strategies/polymarket/kalman-filter-tracker.ts`
- Modify: `src/desk/strategies/polymarket/liquidation-cascade.ts`
- Read: `src/desk/backtesting/gamma-historical-provider.ts` — understand synthetic data limitation
- Read: `src/desk/backtesting/backtest-runner.ts` — backtest integration

## Implementation Steps

1. Implement microstructure-alpha: order book depth imbalance → signal
2. Implement order-flow-toxicity: VPIN/trade flow estimation
3. Implement correlation-breakdown: cross-market correlation threshold
4. Implement pairs-stat-arb: cointegrated pair spread trading
5. Implement funding-rate-arb: perp funding → basis trade
6. Implement gamma-scalping: gamma exposure → delta hedge
7. Implement kalman-filter-tracker: price series → filtered signal
8. Implement liquidation-cascade: on-chain liquidation events → entry signal
9. Backtest each with Gamma synthetic data (smoke test only — note limitation)
10. Toggle `enabled: true` in strategy-wiring.ts for all 8

## Success Criteria

- [ ] 8 strategies with real signal generation
- [ ] Backtest runs without errors for each
- [ ] Paper-trade each — no runtime errors
- [ ] `enabled: true` in strategy-wiring.ts
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — 2,798+ passing

## Risk Assessment

- MEDIUM: Strategies depend on data sources (order book, on-chain events) that may be stubs themselves.
- NOTE: Backtest Sharpe from synthetic Gamma data is a smoke test, not a performance guarantee.
