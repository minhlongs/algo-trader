# Regime Engine — Alpha Discovery

## Purpose

Deterministic, explainable market regime classifier. Operates causally: at timestamp T it uses only data at or before T.

## Regimes

| Regime | Description |
|--------|-------------|
| `TREND_UP` | Strong upward price movement |
| `TREND_DOWN` | Strong downward price movement |
| `RANGE` | Low directional movement, sideways |
| `HIGH_VOLATILITY` | Elevated realized volatility |
| `LOW_VOLATILITY` | Compressed realized volatility |
| `SHOCK` | Abrupt price/volume anomaly |
| `UNKNOWN` | Insufficient data to classify |

## Features Used

- Realized volatility (log returns)
- ATR (average true range)
- Trend strength (ADX-like)
- Moving-average slope
- Return dispersion
- Volume abnormality

## Causal Guarantee

At timestamp T, only candles with index ≤ T are used. Future data is never included in feature computation.

## API

```typescript
import { classifyRegime } from '@/alpha-lab/regimes/regime-engine';

const snapshot = classifyRegime({
  market: 'X',
  timeframe: '1h',
}, candles);
// → { regime: 'TREND_UP', features: {...}, timestamp, market, timeframe }
```

## Files

- `src/alpha-lab/regimes/regime-engine.ts` — classifier logic
- `src/alpha-lab/regimes/regime-types.ts` — type definitions