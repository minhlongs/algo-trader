/**
 * Time-Weighted Mean Reversion V2 — Pure Math & Config Helpers
 */

import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface TimeWeightedMeanReversionConfig extends BaseStrategyConfig {
  priceWindow: number;
  baseZThreshold: number;
  timeWeights: number[];
  minStdDev: number;
}

export const DEFAULT_CONFIG: TimeWeightedMeanReversionConfig = {
  priceWindow: 25,
  baseZThreshold: 2.0,
  timeWeights: Array(24).fill(1.0),
  minStdDev: 0.005,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

export function calcRollingMean(prices: number[]): number {
  if (prices.length === 0) return 0;
  let sum = 0;
  for (const p of prices) sum += p;
  return sum / prices.length;
}

export function calcRollingStd(prices: number[], mean: number): number {
  if (prices.length === 0) return 0;
  let sumSq = 0;
  for (const p of prices) {
    const diff = p - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / prices.length);
}

export function calcZScore(price: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (price - mean) / std;
}

export function getTimeWeight(hour: number, weights: number[]): number {
  const idx = ((hour % 24) + 24) % 24;
  if (idx < 0 || idx >= weights.length) return 1.0;
  return weights[idx];
}

export function isSignalActive(zScore: number, baseThreshold: number, timeWeight: number): boolean {
  return Math.abs(zScore) > baseThreshold * timeWeight;
}
