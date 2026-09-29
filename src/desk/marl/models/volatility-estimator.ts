/**
 * Volatility Estimators for MARL market-making.
 * Implements rolling realized volatility (close-to-close) and Parkinson extreme-value volatility.
 */

export interface HighLowPrice {
  high: number;
  low: number;
}

/**
 * Calculates realized volatility from an array of sequential prices.
 * Returns standard deviation of log returns. Returns 0 if fewer than 2 prices.
 */
export function calculateRealizedVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]!;
    const curr = prices[i]!;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  if (logReturns.length === 0) return 0;
  if (logReturns.length === 1) return Math.abs(logReturns[0]!);

  const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (logReturns.length - 1);

  return Math.sqrt(Math.max(0, variance));
}

/**
 * Calculates Parkinson (1980) extreme-value volatility from High/Low price samples:
 * sigma_p = sqrt( 1 / (4 * ln(2) * n) * sum( (ln(H_i / L_i))^2 ) )
 */
export function calculateParkinsonVolatility(samples: HighLowPrice[]): number {
  if (samples.length === 0) return 0;

  const validSamples = samples.filter((s) => s.high > 0 && s.low > 0 && s.high >= s.low);
  if (validSamples.length === 0) return 0;

  let sumSquaredLogRatios = 0;
  for (const s of validSamples) {
    const ratio = Math.log(s.high / s.low);
    sumSquaredLogRatios += ratio * ratio;
  }

  const denominator = 4 * Math.LN2 * validSamples.length;
  return Math.sqrt(sumSquaredLogRatios / denominator);
}

/**
 * Maintains a fixed-size rolling window of prices to provide continuous volatility estimates.
 */
export class RollingVolatilityEstimator {
  private readonly prices: number[] = [];
  private readonly windowSize: number;
  private readonly defaultVol: number;
  private currentVol: number;

  constructor(windowSize = 60, defaultVol = 0.02) {
    this.windowSize = Math.max(2, windowSize);
    this.defaultVol = defaultVol;
    this.currentVol = defaultVol;
  }

  public update(price: number): number {
    if (price <= 0) return this.currentVol;

    this.prices.push(price);
    if (this.prices.length > this.windowSize) {
      this.prices.shift();
    }

    if (this.prices.length >= 2) {
      const vol = calculateRealizedVolatility(this.prices);
      // Floor at non-zero if vol is 0 to avoid zero-volatility collapse
      this.currentVol = vol > 0 ? vol : this.defaultVol;
    } else {
      this.currentVol = this.defaultVol;
    }

    return this.currentVol;
  }

  public getVolatility(): number {
    return this.currentVol;
  }

  public getSampleCount(): number {
    return this.prices.length;
  }

  public reset(): void {
    this.prices.length = 0;
    this.currentVol = this.defaultVol;
  }
}
