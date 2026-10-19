/**
 * Pure tail-probability, reversion rate, premium, and EV math for TailRiskHarvesterStrategy.
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface TailRiskHarvesterConfig extends BaseStrategyConfig {
  extremeHigh: number;
  extremeLow: number;
  minReversionRate: number;
  reversionWindow: number;
}

export const DEFAULT_CONFIG: TailRiskHarvesterConfig = {
  extremeHigh: 0.92,
  extremeLow: 0.08,
  minReversionRate: 0.3,
  reversionWindow: 30,
  minVolume: 5000,
  takeProfitPct: 0.015,
  stopLossPct: 0.05,
  maxHoldMs: 30 * 60_000,
  maxPositions: 5,
  cooldownMs: 180_000,
  positionSize: '8',
};

export function isExtremePrice(price: number, extremeHigh: number, extremeLow: number): 'high' | 'low' | null {
  if (price > extremeHigh) return 'high';
  if (price < extremeLow) return 'low';
  return null;
}

export function calcReversionRate(prices: number[], extremeHigh: number, extremeLow: number): number {
  if (prices.length < 2) return 0;
  let extremeCount = 0;
  let reversionCount = 0;
  for (let i = 0; i < prices.length - 1; i++) {
    const currentExtreme = isExtremePrice(prices[i], extremeHigh, extremeLow);
    if (currentExtreme !== null) {
      extremeCount++;
      if (isExtremePrice(prices[i + 1], extremeHigh, extremeLow) === null) {
        reversionCount++;
      }
    }
  }
  if (extremeCount === 0) return 0;
  return reversionCount / extremeCount;
}

export function calcPremium(price: number): number {
  return Math.min(price, 1 - price);
}

export function calcExpectedValue(premium: number, reversionRate: number): number {
  return premium * reversionRate;
}
