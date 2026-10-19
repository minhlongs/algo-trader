/**
 * Pure arrival-rate, asymmetry, and orderbook level diff helpers for OrderArrivalRateStrategy.
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface OrderArrivalRateConfig extends BaseStrategyConfig {
  asymmetryThreshold: number;
  minArrivalRate: number;
  snapshotWindow: number;
}

export const DEFAULT_CONFIG: OrderArrivalRateConfig = {
  asymmetryThreshold: 0.3,
  minArrivalRate: 3,
  snapshotWindow: 10,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 12 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

export interface OrderBookSnapshot {
  bidLevels: string[];
  askLevels: string[];
  timestamp: number;
}

export function countNewLevels(prevLevels: string[], currentLevels: string[]): number {
  const prevSet = new Set(prevLevels);
  let count = 0;
  for (const level of currentLevels) {
    if (!prevSet.has(level)) count++;
  }
  return count;
}

export function calcArrivalAsymmetry(newBids: number, newAsks: number): number {
  const total = newBids + newAsks;
  if (total === 0) return 0;
  return (newBids - newAsks) / total;
}

export function isSignalActive(
  asymmetry: number,
  totalNew: number,
  threshold: number,
  minArrival: number,
): boolean {
  return Math.abs(asymmetry) > threshold && totalNew > minArrival;
}

export function extractPriceLevels(levels: { price: string; size: string }[]): string[] {
  return levels.map((l) => l.price);
}
