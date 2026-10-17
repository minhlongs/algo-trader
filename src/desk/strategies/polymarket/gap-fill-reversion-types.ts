/**
 * Gap Fill Reversion Types and Pure Helpers
 *
 * @module desk/strategies/polymarket/gap-fill-reversion-types
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface GapFillReversionConfig extends BaseStrategyConfig {
  gapThreshold: number;
  confirmTicks: number;
  gapDecayMs: number;
}

export const DEFAULT_CONFIG: GapFillReversionConfig = {
  gapThreshold: 0.03,
  confirmTicks: 2,
  gapDecayMs: 300_000,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

export interface GapRecord {
  direction: 'up' | 'down';
  size: number;
  preGapPrice: number;
  gapPrice: number;
  timestamp: number;
  confirmCount: number;
}

export function detectGap(
  prevPrice: number,
  currentPrice: number,
  threshold: number,
): { isGap: boolean; direction: 'up' | 'down'; size: number } {
  const size = Math.abs(currentPrice - prevPrice);
  const direction: 'up' | 'down' = currentPrice > prevPrice ? 'up' : 'down';
  return { isGap: size > threshold, direction, size };
}

export function isGapConfirmed(
  gapDirection: 'up' | 'down',
  gapPrice: number,
  currentPrice: number,
  confirmCount: number,
  requiredConfirms: number,
): boolean {
  if (confirmCount < requiredConfirms) return false;
  if (gapDirection === 'up') return currentPrice >= gapPrice;
  return currentPrice <= gapPrice;
}

export function isGapStale(gapTimestamp: number, now: number, decayMs: number): boolean {
  return now - gapTimestamp > decayMs;
}

export function calcFillTarget(
  preGapPrice: number,
  gapPrice: number,
  fillPct: number = 0.5,
): number {
  return preGapPrice + fillPct * (gapPrice - preGapPrice);
}
