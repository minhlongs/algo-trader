# Code Snippets: Technical Indicators

A collection of reusable code snippets for implementing common technical indicators in trading strategies.

## Table of Contents

1. [Simple Moving Average (SMA)](#simple-moving-average)
2. [Exponential Moving Average (EMA)](#exponential-moving-average)
3. [Relative Strength Index (RSI)](#relative-strength-index)
4. [Bollinger Bands](#bollinger-bands)
5. [Average True Range (ATR)](#average-true-range)
6. [MACD (Moving Average Convergence Divergence)](#macd)
7. [Volume-Weighted Average Price (VWAP)](#vwap)
8. [Standard Deviation](#standard-deviation)

---

## Simple Moving Average

Calculates the simple moving average over a specified period.

```typescript
/**
 * Calculate Simple Moving Average
 * @param data Array of price values (typically close prices)
 * @param period Number of periods to average
 * @returns SMA value (single value for latest period)
 */
function calculateSMA(data: number[], period: number): number {
  if (data.length < period) {
    throw new Error(`Insufficient data: ${data.length} < ${period}`);
  }

  const recent = data.slice(-period);
  const sum = recent.reduce((total, price) => total + price, 0);
  return sum / period;
}

// Full rolling SMA (returns array of all values)
function calculateRollingSMA(data: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }

  return result;
}

// Usage example:
const closes = [100, 101, 102, 103, 104, 105, 106];
const sma10 = calculateSMA(closes, 5); // Returns 104
```

---

## Exponential Moving Average

Gives more weight to recent prices. Better for trending markets.

```typescript
/**
 * Calculate Exponential Moving Average
 * Uses smoothing: EMA = (price * multiplier) + (prevEMA * (1 - multiplier))
 * @param data Array of price values
 * @param period EMA period (typically 12 or 26)
 * @returns Latest EMA value
 */
function calculateEMA(data: number[], period: number): number {
  if (data.length < period) {
    throw new Error(`Insufficient data: ${data.length} < ${period}`);
  }

  const multiplier = 2 / (period + 1);
  // Start with SMA for first value
  let ema = calculateSMA(data.slice(0, period), period);

  // Calculate EMA from there
  for (let i = period; i < data.length; i++) {
    ema = (data[i]! * multiplier) + (ema * (1 - multiplier));
  }

  return ema;
}

// Full rolling EMA
function calculateRollingEMA(data: number[], period: number): number[] {
  if (data.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result: number[] = [];
  let ema = calculateSMA(data.slice(0, period), period);
  result.push(ema);

  for (let i = period; i < data.length; i++) {
    ema = (data[i]! * multiplier) + (ema * (1 - multiplier));
    result.push(ema);
  }

  return result;
}

// Usage example for MACD crossover:
const closes = [/* ... */];
const ema12 = calculateEMA(closes, 12);
const ema26 = calculateEMA(closes, 26);
const macdLine = ema12 - ema26;
```

---

## Relative Strength Index

Momentum oscillator measuring speed and magnitude of price changes. Range: 0-100.

```typescript
/**
 * Calculate RSI using Wilder's smoothing method
 * @param closes Array of closing prices
 * @param period Typically 14
 * @returns RSI value (0-100)
 */
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) {
    throw new Error(`Insufficient data: ${closes.length} < ${period + 1}`);
  }

  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }

  // Separate gains and losses
  const gains: number[] = changes.map(change => (change > 0 ? change : 0));
  const losses: number[] = changes.map(change => (change < 0 ? -change : 0));

  // Calculate initial averages
  const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Wilder's smoothing for subsequent values
  for (let i = period; i < gains.length; i++) {
    const currentGain = gains[i]!;
    const currentLoss = losses[i]!;

    // Wilder's method: (prevAvg * (period-1) + current) / period
    const smoothedGain = (avgGain * (period - 1) + currentGain) / period;
    const smoothedLoss = (avgLoss * (period - 1) + currentLoss) / period;

    avgGain = smoothedGain;
    avgLoss = smoothedLoss;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Full rolling RSI
function calculateRollingRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = [];

  for (let i = period + 1; i <= closes.length; i++) {
    const subset = closes.slice(0, i);
    result.push(calculateRSI(subset, period));
  }

  return result;
}

// Interpretation:
// - RSI < 30: Oversold (potential buy)
// - RSI > 70: Overbought (potential sell)
// - RSI 30-70: Neutral
// - Bullish/bearish divergences are strong reversal signals

const rsi = calculateRSI(closes, 14);
if (rsi < 30) {
  // Consider buy
} else if (rsi > 70) {
  // Consider sell
}
```

---

## Bollinger Bands

Measures volatility using standard deviation from moving average.

```typescript
/**
 * Calculate Bollinger Bands
 * @param closes Array of closing prices
 * @param period Middle band period (typically 20)
 * @param stdDevMultiplier Standard deviation multiplier (typically 2)
 * @returns Object with upper, middle, lower bands and bandwidth
 */
function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  percentB: number; // Current price position within bands
} {
  if (closes.length < period) {
    throw new Error(`Insufficient data: ${closes.length} < ${period}`);
  }

  const recent = closes.slice(-period);
  const middle = calculateSMA(recent, period);

  // Calculate standard deviation
  const squaredDiffs = recent.map(price => Math.pow(price - middle, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDev * stdDevMultiplier;
  const lower = middle - stdDev * stdDevMultiplier;
  const bandwidth = (upper - lower) / middle;
  const currentPrice = closes[closes.length - 1]!;
  const percentB = (currentPrice - lower) / (upper - lower);

  return { upper, middle, lower, bandwidth, percentB };
}

// Usage:
const bb = calculateBollingerBands(closes, 20, 2);

// Trading signals:
// - Price touches upper band: potential sell (overbought)
// - Price touches lower band: potential buy (oversold)
// - Bandwidth compressing: breakout imminent
// - "Squeeze" = very narrow bands = volatility expansion incoming

if (bb.percentB < 0.05) {
  // Price near lower band - potential buy
} else if (bb.percentB > 0.95) {
  // Price near upper band - potential sell
}
```

---

## Average True Range (ATR)

Measures market volatility. Used for dynamic stop-loss placement.

```typescript
/**
 * Calculate Average True Range
 * ATR measures average volatility over N periods
 * @param candles Array of OHLC data
 * @param period Number of periods (typically 14)
 * @returns ATR value
 */
function calculateATR(candles: ICandle[], period: number = 14): number {
  if (candles.length < period + 1) {
    throw new Error(`Insufficient data: ${candles.length} < ${period + 1}`);
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;

    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - previous.close);
    const lowClose = Math.abs(current.low - previous.close);

    const tr = Math.max(highLow, highClose, lowClose);
    trueRanges.push(tr);
  }

  // Initial ATR = simple average of first N TRs
  const initialATR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Smooth subsequent values using Wilder's smoothing
  let atr = initialATR;
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]!) / period;
  }

  return atr;
}

// Usage for stop-loss:
const atr = calculateATR(candles, 14);
const stopDistance = atr * 2; // 2x ATR stop
const entryPrice = currentPrice;
const longStopLoss = entryPrice - stopDistance;
const shortStopLoss = entryPrice + stopDistance;

// Position sizing:
const riskPerUnit = Math.abs(entryPrice - stopDistance);
const positionSize = accountBalance * riskPercent / riskPerUnit;
```

---

## MACD (Moving Average Convergence Divergence)

Trend-following momentum indicator.

```typescript
interface MACDValues {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

/**
 * Calculate MACD line, signal line, and histogram
 * Standard: EMA(12) - EMA(26), Signal: EMA(9) of MACD, Histogram: MACD - Signal
 */
function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDValues {
  if (closes.length < slowPeriod + signalPeriod) {
    throw new Error(`Insufficient data`);
  }

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macdLine = emaFast - emaSlow;
  const signalLine = calculateEMA([macdLine], signalPeriod); // Note: normally uses rolling array
  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}

// Trading signals:
// - MACD line crosses above signal line → Bullish (buy)
// - MACD line crosses below signal line → Bearish (sell)
// - Histogram bars flip from negative to positive → Bullish momentum
// - Divergence between MACD and price → Reversal warning

function detectMACDCrossover(prev: MACDValues, curr: MACDValues): 'bullish' | 'bearish' | 'none' {
  const prevCross = prev.macdLine > prev.signalLine;
  const currCross = curr.macdLine > curr.signalLine;

  if (!prevCross && currCross) return 'bullish';
  if (prevCross && !currCross) return 'bearish';
  return 'none';
}
```

---

## Volume-Weighted Average Price (VWAP)

Average price weighted by volume. Key intraday benchmark.

```typescript
interface VWAPResult {
  vwap: number;
  typicalPrice: number;
  cumulativeTPVolume: number;
  cumulativeVolume: number;
}

/**
 * Calculate VWAP from OHLCV data
 * VWAP = Σ(Price × Volume) / Σ(Volume)
 * Typically uses "typical price": (high + low + close) / 3
 */
function calculateVWAP(candles: ICandle[]): VWAPResult {
  let cumulativeTPVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume;

    cumulativeTPVolume += typicalPrice * volume;
    cumulativeVolume += volume;
  }

  const vwap = cumulativeVolume > 0 ? cumulativeTPVolume / cumulativeVolume : 0;

  return {
    vwap,
    typicalPrice: candles[candles.length - 1] ?
      (candles[candles.length - 1]!.high +
       candles[candles.length - 1]!.low +
       candles[candles.length - 1]!.close) / 3 : 0,
    cumulativeTPVolume,
    cumulativeVolume,
  };
}

// Trading with VWAP:
// - Price above VWAP → Bullish (buy dips)
// - Price below VWAP → Bearish (sell rallies)
// - VWAP slope indicates trend direction
// - Multiple touches of VWAP act as support/resistance
```

---

## Standard Deviation

Measures price dispersion from mean. Core to volatility calculations.

```typescript
/**
 * Calculate Standard Deviation
 * σ = √(Σ(x - μ)² / N)
 */
function calculateStdDev(data: number[], mean?: number): number {
  if (data.length === 0) return 0;

  const avg = mean ?? data.reduce((a, b) => a + b, 0) / data.length;

  const squaredDiffs = data.map(value => Math.pow(value - avg, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / data.length;

  return Math.sqrt(variance);
}

/**
 * Calculate rolling standard deviation
 */
function calculateRollingStdDev(data: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = period - 1; i < data.length; i++) {
    const window = data.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    result.push(calculateStdDev(window, mean));
  }

  return result;
}

// Coefficient of Variation (normalized volatility):
const cv = calculateStdDev(closes) / calculateSMA(closes, 20);

// Bollinger Band %B uses normalized standard deviation:
const normalizedStdDev = (price - sma) / stdDev;
```

---

## Common Patterns

### Signal Confirmation

```typescript
// Require multiple indicators to agree before entering
function confirmSignal(indicators: Array<{ signal: 'buy' | 'sell'; confidence: number }>): boolean {
  const buyCount = indicators.filter(i => i.signal === 'buy' && i.confidence > 0.7).length;
  const sellCount = indicators.filter(i => i.signal === 'sell' && i.confidence > 0.7).length;

  // Need at least 3 of 5 indicators to agree
  return Math.max(buyCount, sellCount) >= 3;
}
```

### Smooth Signal Transitions

```typescript
// Hysteresis to prevent whipsaw (requires stronger signal to flip)
class HysteresisSignal {
  private currentSignal: 'buy' | 'sell' | 'wait' = 'wait';
  private thresholdBuy = 0.7;
  private thresholdSell = 0.7;
  private hysteresisBuffer = 0.1; // Gap between thresholds

  evaluate(confidence: number, signal: 'buy' | 'sell'): 'buy' | 'sell' | 'wait' {
    if (signal === 'buy' && confidence >= this.thresholdBuy) {
      this.currentSignal = 'buy';
      this.thresholdSell = this.thresholdBuy + this.hysteresisBuffer;
    } else if (signal === 'sell' && confidence >= this.thresholdSell) {
      this.currentSignal = 'sell';
      this.thresholdBuy = this.thresholdSell + this.hysteresisBuffer;
    }

    return this.currentSignal;
  }
}
```

---

## Performance Tips

1. **Cache calculations**: Don't recalculate SMA/EMA every tick unless data changes
2. **Use incremental updates**: For rolling indicators, update from previous value instead of full recalculation
3. **Limit data history**: Keep only what's needed (e.g., 2× max period)
4. **Pre-allocate arrays**: For rolling calculations, pre-size arrays to avoid reallocations
5. **Batch process**: Process multiple candles at once, not one at a time

```typescript
// Good: Process batch
async execute(candles: ICandle[]): Promise<ISignal> {
  this.priceHistory.push(...candles);
  this.priceHistory = this.priceHistory.slice(-200); // Cap history
  const sma = calculateSMA(this.priceHistory.map(c => c.close), 20);
  // ... rest of logic
}

// Avoid: One-candle-at-a-time with full recalculation
```

---

## Testing Your Indicators

```typescript
import { describe, it, expect } from 'vitest';

describe('Technical Indicators', () => {
  it('should calculate SMA correctly', () => {
    const data = [100, 101, 102, 103, 104];
    const sma = calculateSMA(data, 5);
    expect(sma).toBe(102);
  });

  it('should throw on insufficient data', () => {
    const data = [100, 101];
    expect(() => calculateSMA(data, 5)).toThrow();
  });

  it('should handle flat data', () => {
    const data = [100, 100, 100, 100, 100];
    const sma = calculateSMA(data, 5);
    expect(sma).toBe(100);
  });
});
```

---

## References

- `src/strategies/examples/` - Complete example strategies
- `src/interfaces/IStrategy.ts` - Strategy interface definition
- `docs/api-reference.md` - Full API documentation
- `src/strategies/polymarket/` - Production strategy implementations
