/**
 * Inventory Skew Rebalancer — pure math helpers.
 * Split from inventory-skew-rebalancer.ts (S16 tranche 3).
 * Exported for testing; facade re-exports these unchanged.
 */

import type { TrackedPosition } from './inventory-skew-types';

/** Calculate portfolio skew: (yesExposure - noExposure) / totalExposure. Returns 0 when empty. */
export function calcSkew(positions: TrackedPosition[]): number {
  let yesExposure = 0;
  let noExposure = 0;
  for (const p of positions) {
    const value = p.size * p.currentPrice;
    if (p.side === 'yes') {
      yesExposure += value;
    } else {
      noExposure += value;
    }
  }
  const total = yesExposure + noExposure;
  if (total === 0) return 0;
  return (yesExposure - noExposure) / total;
}

/** Calculate the concentration of a single position relative to total exposure. */
export function calcConcentration(position: TrackedPosition, positions: TrackedPosition[]): number {
  const total = positions.reduce((sum, p) => sum + p.size * p.currentPrice, 0);
  if (total === 0) return 0;
  return (position.size * position.currentPrice) / total;
}

/** Determine whether a rebalance should occur given current skew and elapsed time. */
export function shouldRebalance(
  skew: number,
  skewThreshold: number,
  lastRebalanceAt: number,
  rebalanceIntervalMs: number,
  now: number,
): boolean {
  if (now - lastRebalanceAt < rebalanceIntervalMs) return false;
  return Math.abs(skew) > skewThreshold;
}

/** Unrealised P&L for a position. */
export function unrealizedPnl(pos: TrackedPosition): number {
  return pos.size * (pos.currentPrice - pos.entryPrice);
}