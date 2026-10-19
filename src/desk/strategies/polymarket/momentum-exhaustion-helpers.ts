import type { BaseStrategyConfig, OpenPosition } from './base-polymarket-strategy';

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
  if (Math.abs(priceVel) < 0.0005) return null;
  if (volumeRate <= 0) return null;

  if (priceVel > 0 && priceVel < prevPriceVel) {
    return 'no';
  }
  if (priceVel < 0 && priceVel > prevPriceVel) {
    return 'yes';
  }
  return null;
}

/** Append price & volume samples to history maps and cap length at maxLen. */
export function appendExhaustionTick(
  priceHistory: Map<string, number[]>,
  volumeHistory: Map<string, number[]>,
  tokenId: string,
  price: number,
  volume: number,
  maxLen: number,
): { prices: number[]; vols: number[] } {
  let prices = priceHistory.get(tokenId);
  if (!prices) {
    prices = [];
    priceHistory.set(tokenId, prices);
  }
  prices.push(price);

  let vols = volumeHistory.get(tokenId);
  if (!vols) {
    vols = [];
    volumeHistory.set(tokenId, vols);
  }
  vols.push(volume);

  if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
  if (vols.length > maxLen) vols.splice(0, vols.length - maxLen);
  return { prices, vols };
}

/** Evaluate custom ATR stop or opposite-exhaustion exit condition. */
export function evaluateExhaustionExit(
  pos: OpenPosition,
  currentPrice: number,
  prices: number[] | undefined,
  vols: number[] | undefined,
  prevVelMap: Map<string, number>,
  cfg: MomentumExhaustionConfig,
): { exit: boolean; reason: string } {
  if (!prices || !vols || prices.length < cfg.velocityWindow + 1) {
    return { exit: false, reason: '' };
  }

  const atr = calcATR(prices, cfg.atrPeriod);
  if (atr > 0) {
    const priceMove = Math.abs(currentPrice - pos.entryPrice);
    if (priceMove > atr * cfg.atrStopMultiplier) {
      return { exit: true, reason: `atr-stop (${(priceMove / atr).toFixed(2)}x ATR)` };
    }
  }

  const priceVel = calcVelocity(prices, cfg.velocityWindow);
  const prevVel = prevVelMap.get(pos.tokenId) ?? priceVel;
  const volumeRate = calcVolumeRate(vols, cfg.velocityWindow);
  const signal = detectExhaustion(priceVel, prevVel, volumeRate);
  if (signal !== null && signal !== pos.side) {
    return { exit: true, reason: `opposite-exhaustion (signal=${signal})` };
  }

  return { exit: false, reason: '' };
}
