/**
 * Mathematical calculations and signal determination for Weighted Sentiment Aggregator V2.
 */

import type { WeightedSentimentAggregatorConfig } from './weighted-sentiment-aggregator-v2';

export function calcBookImbalance(bidSize: number, askSize: number): number {
  const total = bidSize + askSize;
  if (total === 0) return 0;
  return (bidSize - askSize) / total;
}

export function calcPriceVelocity(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

export function calcVolumeTrend(currentVol: number, avgVol: number): number {
  if (avgVol === 0) return 0;
  return currentVol / avgVol;
}

export function calcCompositeScore(
  imbalance: number,
  velocity: number,
  volumeTrend: number,
  config: Pick<WeightedSentimentAggregatorConfig, 'wImbalance' | 'wVelocity' | 'wVolume'>,
): number {
  return (
    config.wImbalance * imbalance +
    config.wVelocity * velocity +
    config.wVolume * (volumeTrend - 1)
  );
}

export function determineSignal(score: number, threshold: number): 'yes' | 'no' | null {
  if (score > threshold) return 'yes';
  if (score < -threshold) return 'no';
  return null;
}
