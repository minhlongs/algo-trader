---
name: quant-trading
description: "Quantitative trading strategy development for algo-trader. Covers strategy creation, backtesting, signal generation, technical indicators, Polymarket CLOB integration, and strategy registration. Triggers: strategy, backtest, signal, RSI, SMA, indicator, Polymarket strategy, CLOB, signal fusion, regime detection, new strategy, strategy registration, quant research"
---

# Quant Trading Skill

## Purpose

Guide strategy development for algo-trader's 52+ Polymarket strategies + CEX/DEX trading. Covers the full lifecycle: design → implement → backtest → register → deploy.

## Codebase Layout

```
src/strategies/
  polymarket/          # 30+ Polymarket-specific strategies (barrel export in index.ts)
  dna/                 # Multi-timeframe DNA consensus engine (BTC focus)
  kronos-strategy.ts   # Kronos strategy entry point
  probability-calibrator.ts  # Probability calibration
src/strategies/dna/
  indicators-trend.ts       # EMA20/50/200, ADX
  indicators-momentum.ts    # RSI(14), MACD
  indicators-volatility.ts  # ATR(14), Bollinger Bands
  indicators-microstructure.ts  # Orderbook microstructure
  consensus-engine.ts       # Multi-TF weighted consensus
  regime-detector.ts        # Market regime classification
  orchestrator.ts           # DNA engine lifecycle
  paper-executor.ts         # Paper trade execution from consensus
src/interfaces/IStrategy.ts  # ISignal, ICandle, IStrategy interface
src/arbitrage/backtester.ts  # Historical replay backtester
```

## Strategy Pattern (Polymarket)

All Polymarket strategies follow the **factory function pattern**:

```typescript
// src/strategies/polymarket/orderbook-depth-ratio.ts
export interface OrderbookDepthConfig { depthLevels: number; highThreshold: number; ... }
export interface OrderbookDepthDeps { /* injected deps */ }

export function createOrderbookDepthRatioTick(
  config: OrderbookDepthConfig,
  deps: OrderbookDepthDeps
): (ctx: TickContext) => Promise<void>
```

**Registration:** Add export to `src/strategies/polymarket/index.ts` barrel.

## Strategy Categories (30+ existing)

| Category | Examples | Key File |
|----------|----------|----------|
| Orderbook | orderbook-depth-ratio, stale-quote-sniper, cluster-breakout | `orderbook-depth-ratio.ts` |
| Momentum | momentum-cascade, decay-rate-momentum, regime-adaptive-momentum | `momentum-cascade.ts` |
| Mean Reversion | spread-mean-reversion, time-weighted-mean-reversion, gap-fill-reversion | `spread-mean-reversion.ts` |
| Volatility | vol-compression-breakout, volatility-targeting, bollinger-squeeze | `vol-compression-breakout.ts` |
| Sentiment | weighted-sentiment-aggregator, herd-behavior-detector, recency-bias-exploiter | `weighted-sentiment-aggregator.ts` |
| Arbitrage | delta-neutral-volatility-arbitrage, multi-leg-hedge, liquidity-migration | `delta-neutral-volatility-arbitrage.ts` |
| Regime | regime-switch-detector, regime-adaptive-momentum | `regime-switch-detector.ts` |
| Predictive | markov-chain-predictor, cross-correlation-lag, price-acceleration | `markov-chain-predictor.ts` |

## Technical Indicators

### Trend (src/strategies/dna/indicators-trend.ts)
- **EMA**: 20/50/200 with Wilder-correct approximation
- **ADX**: Period 14, trending ≥25, weak ≤20
- Output: `TrendIndicators { ema20, ema50, ema200, adx, adxTrend, computedAt }`

### Momentum (src/strategies/dna/indicators-momentum.ts)
- **RSI(14)**: Wilder smoothing, returns 0-100
- **MACD**: fast=12, slow=26, signal=9
- Output: `MomentumIndicators { rsi, macdLine, macdSignal, macdHistogram }`

### Volatility (src/strategies/dna/indicators-volatility.ts)
- **ATR(14)**: Wilder smoothing
- **Bollinger Bands**: period=20, std=2σ
- Output: `VolatilityIndicators { atr, atrPct, bbUpper, bbLower, bbWidth, bbWidthPct }`

### Microstructure (src/strategies/dna/indicators-microstructure.ts)
- Orderbook imbalance, bid/ask volume ratios

## DNA Multi-Timeframe Consensus

The DNA engine fuses signals across 6 timeframes:

| TF | Weight | Role |
|----|--------|------|
| 1d | 0.30 | Trend anchor |
| 4h | 0.25 | Structural direction |
| 1h | 0.20 | Intermediate confirmation |
| 15m | 0.15 | Timing layer |
| 5m | 0.07 | Fine entry timing |
| 1m | 0.03 | Microstructure noise filter |

**Decision rules:**
- `weightedBullScore - weightedBearScore >= consensusSpread` → enter_long
- `weightedBearScore - weightedBullScore >= consensusSpread` → enter_short
- Otherwise → hold
- Confidence gate: `max(bull, bear) >= minConsensusConfidence`
- Agreement gate: `count(TF matching direction) >= minTfAgreement`

## Signal Fusion (src/intelligence/signal-fusion-engine.ts)

Pure mathematical fusion (no LLM):
- `fuseSignals()`: weighted average → direction + confidence
- `updateWeights()`: EMA-based self-learning (`newWeight = 0.9*old + 0.1*(correct?1.2:0.8)`)
- Thresholds: score > 0.1 = UP, < -0.1 = DOWN, else NEUTRAL

## AI Consensus Swarm (src/intelligence/signal-consensus-swarm.ts)

3-persona debate (risk-analyst, momentum-trader, contrarian) + optional 4th (quantitative-analyst via Qwen):
- Majority vote (2/3 or 3/4) determines approve/reject
- Fail-closed: ≥2 failed LLM calls → reject
- Env: `SWARM_CONSENSUS_ENABLED`, `SWARM_MIN_CONFIDENCE` (0.6), `SWARM_QWEN_ENABLED`

## Backtesting

Use `src/arbitrage/backtester.ts` as reference pattern:
- Historical data replay through strategy
- PnL tracking: `totalProfit`, `totalLoss`, `winningTrades`, `losingTrades`
- Metrics: win rate, profit factor, max drawdown, Sharpe ratio

## Creating a New Strategy

1. Create `src/strategies/polymarket/<strategy-name>.ts`
2. Follow factory function pattern with `Config` + `Deps` interfaces
3. Import from `../../polymarket/clob-client`, `../../polymarket/order-manager`, `../../polymarket/kelly-position-sizer`
4. Add barrel export to `src/strategies/polymarket/index.ts`
5. Write tests in `src/strategies/polymarket/__tests__/` or `src/strategies/dna/__tests__/`
6. Run `npm test` to verify

## References

- `references/strategy-registration.md` — Step-by-step registration guide
- `references/indicator-catalog.md` — All available indicators with parameters
- `references/dna-architecture.md` — DNA engine internals and lifecycle
