/**
 * Mathematical signal extractors for BTC 15-Minute Strategy.
 */

export const MOMENTUM_WINDOW = 5;
export const VOL_NEUTRAL_PCT = 0.01;
export const REVERSION_MAX_PCT = 0.005;

/** Extract close prices from klines (all except the last, incomplete candle) */
export function extractCloses(klines: [number, string, string, string, string, string, ...unknown[]][]): number[] {
  return klines.slice(0, -1).map(k => parseFloat(k[4]));
}

/** Extract volume from klines (parallel to closes) */
export function extractVolumes(klines: [number, string, string, string, string, string, ...unknown[]][]): number[] {
  return klines.slice(0, -1).map(k => parseFloat(k[5]));
}

/**
 * Momentum signal: returns score in [-1, +1].
 * Positive = price rising, negative = falling.
 */
export function computeMomentum(closes: number[]): number {
  if (closes.length < MOMENTUM_WINDOW + 1) return 0;
  const recent = closes[closes.length - 1];
  const baseline = closes[closes.length - 1 - MOMENTUM_WINDOW];
  if (baseline === 0) return 0;

  const pctChange = (recent - baseline) / baseline;
  return Math.max(-1, Math.min(1, pctChange / 0.02));
}

/**
 * Volatility signal: returns score in [-1, +1].
 * High volatility → positive score (breakout). Low volatility → negative.
 */
export function computeVolatility(closes: number[]): number {
  if (closes.length < 2) return 0;

  const mean = closes.reduce((s, c) => s + c, 0) / closes.length;
  const variance = closes.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / closes.length;
  const stddev = Math.sqrt(variance);
  const stddevPct = mean > 0 ? stddev / mean : 0;

  const raw = (stddevPct - VOL_NEUTRAL_PCT) / VOL_NEUTRAL_PCT;
  return Math.max(-1, Math.min(1, raw));
}

/**
 * Mean reversion signal: returns score in [-1, +1].
 * Negative (below VWAP) → expects UP (positive score).
 */
export function computeMeanReversion(closes: number[], volumes: number[]): number {
  if (closes.length === 0 || closes.length !== volumes.length) return 0;

  const totalVol = volumes.reduce((s, v) => s + v, 0);
  if (totalVol === 0) {
    const avg = closes.reduce((s, c) => s + c, 0) / closes.length;
    const last = closes[closes.length - 1];
    const dist = (avg - last) / avg;
    return Math.max(-1, Math.min(1, dist / REVERSION_MAX_PCT));
  }

  const vwap = closes.reduce((s, c, i) => s + c * volumes[i], 0) / totalVol;
  const last = closes[closes.length - 1];
  const dist = (vwap - last) / vwap;
  return Math.max(-1, Math.min(1, dist / REVERSION_MAX_PCT));
}
