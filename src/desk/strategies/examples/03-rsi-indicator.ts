/**
 * RSI (Relative Strength Index) technical indicator calculation utilities
 */

/**
 * Calculate RSI using Wilder's smoothing method
 */
export function calculateWilderRsi(closes: number[], period: number): number {
  const recent = closes.slice(-period - 1);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < recent.length; i++) {
    const change = recent[i]! - recent[i - 1]!;
    if (change > 0) {
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(change));
    }
  }

  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Check if RSI was recently oversold (below threshold in lookback window)
 */
export function wasRecentlyOversold(rsiValues: number[], oversold: number): boolean {
  return rsiValues.slice(0, -1).some((r) => r < oversold);
}

/**
 * Check if RSI was recently overbought (above threshold in lookback window)
 */
export function wasRecentlyOverbought(rsiValues: number[], overbought: number): boolean {
  return rsiValues.slice(0, -1).some((r) => r > overbought);
}

/**
 * Calculate buy confidence based on RSI depth and recovery strength
 */
export function calculateRsiBuyConfidence(
  current: number,
  recent: number[],
  oversold: number
): number {
  const minRsi = Math.min(...recent);
  const depth = oversold - minRsi;
  const baseConfidence = 0.6 + Math.min(depth / 20, 0.3);

  const prev = recent[recent.length - 2];
  const momentum = prev !== undefined ? current - prev : 0;
  const momentumBoost = momentum > 0 ? 0.1 : 0;

  return Math.min(baseConfidence + momentumBoost, 1.0);
}

/**
 * Calculate sell confidence based on RSI height and rollover strength
 */
export function calculateRsiSellConfidence(
  current: number,
  recent: number[],
  overbought: number
): number {
  const maxRsi = Math.max(...recent);
  const height = maxRsi - overbought;
  const baseConfidence = 0.6 + Math.min(height / 20, 0.3);

  const prev = recent[recent.length - 2];
  const momentum = prev !== undefined ? current - prev : 0;
  const momentumBoost = momentum < 0 ? 0.1 : 0;

  return Math.min(baseConfidence + momentumBoost, 1.0);
}
