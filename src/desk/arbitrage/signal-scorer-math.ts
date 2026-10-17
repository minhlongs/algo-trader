/**
 * Pure Signal Scoring Math, Weights, Thresholds, and Reliability Decay Helpers.
 * Extracted from signal-scorer.ts for modularity and single responsibility.
 */

import type { ArbitrageOpportunity } from './spread-detector';

export interface SignalScore {
  opportunity: ArbitrageOpportunity;
  totalScore: number;
  breakdown: {
    spreadScore: number;
    latencyScore: number;
    volumeScore: number;
    reliabilityScore: number;
  };
  rank: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SKIP';
}

export interface ScorerConfig {
  weights: {
    spread: number;
    latency: number;
    volume: number;
    reliability: number;
  };
  thresholds: {
    strongBuy: number;
    buy: number;
    hold: number;
  };
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  weights: {
    spread: 0.4,
    latency: 0.25,
    volume: 0.2,
    reliability: 0.15,
  },
  thresholds: {
    strongBuy: 85,
    buy: 70,
    hold: 50,
  },
};

export const DEFAULT_EXCHANGE_RELIABILITY: ReadonlyArray<readonly [string, number]> = [
  ['binance', 0.95],
  ['okx', 0.92],
  ['bybit', 0.90],
];

/**
 * Score spread (0-100). Higher spread = higher score.
 */
export function computeSpreadScore(spreadPercent: number): number {
  const normalized = Math.min(spreadPercent * 100, 100);
  return Math.min(normalized, 100);
}

/**
 * Score latency (0-100). Lower latency = higher score.
 */
export function computeLatencyScore(latencyMs: number): number {
  const score = 100 - latencyMs / 10;
  return Math.max(Math.min(score, 100), 0);
}

/**
 * Score volume (0-100). Higher volume = higher score.
 */
export function computeVolumeScore(volume: number): number {
  const normalized = Math.log10(volume + 1) * 25;
  return Math.min(Math.max(normalized, 0), 100);
}

/**
 * Get exchange reliability score (0-100).
 */
export function computeReliabilityScore(
  exchange: string,
  exchangeReliability: ReadonlyMap<string, number>
): number {
  const reliability = exchangeReliability.get(exchange.toLowerCase()) || 0.5;
  return reliability * 100;
}

/**
 * Calculate weighted total score for an opportunity.
 */
export function computeWeightedTotalScore(
  breakdown: SignalScore['breakdown'],
  weights: ScorerConfig['weights']
): number {
  return (
    breakdown.spreadScore * weights.spread +
    breakdown.latencyScore * weights.latency +
    breakdown.volumeScore * weights.volume +
    breakdown.reliabilityScore * weights.reliability
  );
}

/**
 * Get recommendation based on score and thresholds.
 */
export function evaluateRecommendation(
  score: number,
  thresholds: ScorerConfig['thresholds']
): SignalScore['recommendation'] {
  if (score >= thresholds.strongBuy) return 'STRONG_BUY';
  if (score >= thresholds.buy) return 'BUY';
  if (score >= thresholds.hold) return 'HOLD';
  return 'SKIP';
}

/**
 * Compute updated exchange reliability factor bounded to [0.1, 0.99].
 */
export function computeAdjustedReliability(current: number, success: boolean): number {
  const adjustment = success ? 0.01 : -0.02;
  return Math.max(0.1, Math.min(0.99, current + adjustment));
}
