/**
 * News Catalyst Fade Strategy — Config and pure math helpers.
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface NewsCatalystFadeConfig extends BaseStrategyConfig {
  /** Price movement threshold to detect spike (as fraction, e.g. 0.05 = 5%) */
  spikePct: number;
  /** Lookback ticks for velocity calculation */
  velocityWindow: number;
  /** Fraction of spike to retrace before closing (0.5 = 50% retrace) */
  retraceTarget: number;
  /** Expected fade edge as fraction */
  minEdge: number;
}

export const DEFAULT_CONFIG: NewsCatalystFadeConfig = {
  spikePct: 0.04,
  velocityWindow: 3,
  retraceTarget: 0.5,
  minEdge: 0.01,
  minVolume: 2000,
  takeProfitPct: 0.05,
  stopLossPct: 0.03,
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 180_000,
  positionSize: '15',
};

/** Calculate price velocity over window (positive = up, negative = down). */
export function calcVelocity(prices: number[], window: number): number {
  if (prices.length < window + 1) return 0;
  return prices[prices.length - 1]! - prices[prices.length - 1 - window]!;
}

/** Detect a price spike: absolute change > threshold. Returns direction or null. */
export function detectSpike(prices: number[], window: number, spikePct: number): 'yes' | 'no' | null {
  if (prices.length < window + 1) return null;
  const velocity = calcVelocity(prices, window);
  const basePrice = prices[prices.length - 1 - window]!;
  if (basePrice <= 0) return null;
  const changePct = Math.abs(velocity) / basePrice;
  if (changePct < spikePct) return null;
  // Spike up -> fade by betting no; spike down -> fade by betting yes
  return velocity > 0 ? 'no' : 'yes';
}

/** Calculate retrace level: price level at which we take profit on fade. */
export function calcRetracePrice(
  entryPrice: number,
  spikeStartPrice: number,
  side: 'yes' | 'no',
  retracePct: number,
): number {
  const spikeMove = Math.abs(entryPrice - spikeStartPrice);
  return side === 'yes'
    ? entryPrice + spikeMove * retracePct
    : entryPrice - spikeMove * retracePct;
}
