import { ArbitrageOpportunity } from './spread-detector';

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

export function scoreSpreadValue(spreadPercent: number): number {
  return Math.min(spreadPercent * 100, 100);
}

export function scoreLatencyValue(latencyMs: number): number {
  return Math.max(Math.min(100 - latencyMs / 10, 100), 0);
}

export function scoreVolumeValue(volume: number): number {
  return Math.min(Math.max(Math.log10(volume + 1) * 25, 0), 100);
}

export function computeWeightedSignalScore(
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

export function classifyRecommendation(
  score: number,
  thresholds: ScorerConfig['thresholds']
): SignalScore['recommendation'] {
  if (score >= thresholds.strongBuy) return 'STRONG_BUY';
  if (score >= thresholds.buy) return 'BUY';
  if (score >= thresholds.hold) return 'HOLD';
  return 'SKIP';
}
