import type { BaseStrategyConfig } from './base-polymarket-strategy';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MomentumExhaustionConfig extends BaseStrategyConfig {
  /** Window (ticks) for calculating price velocity */
  velocityWindow: number;
  /** Period for ATR calculation */
  atrPeriod: number;
  /** Stop-loss exit multiplier (x ATR) */
  atrStopMultiplier: number;
}

export const DEFAULT_CONFIG: MomentumExhaustionConfig = {
  velocityWindow: 5,
  atrPeriod: 8,
  atrStopMultiplier: 2.0,
  minVolume: 2000,
  takeProfitPct: 0.035,
  stopLossPct: 0.10, // generous; ATR-based exit handles dynamic stop
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Average (mean) rate of change over the last `window` ticks. */
export function calcVelocity(values: number[], window: number): number {
  if (values.length < window + 1) return 0;
  return (values[values.length - 1] - values[values.length - 1 - window]) / window;
}

/** Average per-tick volume delta over the window (cumulative volume proxy). */
export function calcVolumeRate(volumes: number[], window: number): number {
  if (volumes.length < window + 1) return 0;
  return (volumes[volumes.length - 1] - volumes[volumes.length - 1 - window]) / window;
}

/** Average True Range from a series of mid-price snapshots. */
export function calcATR(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / period;
}

/**
 * Detect momentum exhaustion.
 *
 * @returns 'yes' (downtrend exhaustion -> buy YES for reversal up),
 *          'no'  (uptrend exhaustion -> buy NO for reversal down),
 *          null  (no exhaustion)
 */
export function detectExhaustion(
  priceVel: number,
  prevPriceVel: number,
  volumeRate: number,
): 'yes' | 'no' | null {
  // Need minimum velocity magnitude
  if (Math.abs(priceVel) < 0.0005) return null;
  // Need volume to be increasing
  if (volumeRate <= 0) return null;

  // Up-trend exhaustion: velocity positive but decelerating
  if (priceVel > 0 && priceVel < prevPriceVel) {
    return 'no';
  }
  // Down-trend exhaustion: velocity negative but improving (less negative)
  if (priceVel < 0 && priceVel > prevPriceVel) {
    return 'yes';
  }
  return null;
}
