# Regime Engine

Deterministic, explainable market-regime classifier. Does **not** use an LLM.
Operates causally: at timestamp T it may use only data available at or before T.

## Location

`src/alpha-lab/regimes/regime-engine.ts`

## Regimes

| Regime | Meaning |
|--------|---------|
| `TREND_UP` | Prices rising with strong trend |
| `TREND_DOWN` | Prices falling with strong trend |
| `RANGE` | Low-trend, mean-reverting price action |
| `HIGH_VOLATILITY` | Elevated realized volatility |
| `LOW_VOLATILITY` | Compressed volatility |
| `SHOCK` | Large single-bar move |
| `UNKNOWN` | No rule matched (default classifier) |

## Features

All features are pure functions of the provided lookback window:

| Feature | Function | Meaning |
|---------|----------|---------|
| Realized volatility | `realizedVolatility` | Annualized vol over lookback |
| ATR | `averageTrueRange` | Average True Range |
| Trend strength | `trendStrength` | Directional consistency |
| MA slope | `closeSlope` | Slope of close prices (linear regression) |
| Return dispersion | `returnDispersion` | Spread of bar returns |
| Volume abnormality | `volumeAbnormality` | Volume vs. lookback average |

`computeRegimeFeatures(candles)` returns the full `RegimeFeatures` object.
`pickRegime(features, rules)` applies the rule set and returns a regime tag.
`defaultRules()` returns the canonical rule list.

## Usage

```typescript
import { classifyRegime, defaultRules } from './regime-engine';
import type { CandleLike } from './regime-types';

const snapshot = classifyRegime(
  { market: 'BTC/USDT', timeframe: '1h', lookback: 100 },
  candles,
  defaultRules(),
);
// snapshot.regime: 'TREND_UP'
// snapshot.explanation: human-readable rule trace
```

`buildExplanation(snapshot)` produces a readable explanation of why a regime
was chosen.

## Causal Invariant

The engine never reads future candles. The lookback window passed to
`classifyRegime` ends at the current bar. Tests in
`src/alpha-lab/regimes/__tests__/regime-engine.test.ts` include a regression
check that future data cannot influence a signal at timestamp T.

## Determinism

All functions are pure. Same input candles → same regime tag, every time.