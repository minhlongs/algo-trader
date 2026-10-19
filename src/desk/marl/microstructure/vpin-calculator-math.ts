/**
 * Pure VPIN Bucket, Lee-Ready Classification, and Toxicity CDF Math Helpers.
 * Extracted from vpin-calculator.ts for modularity and single responsibility.
 */
import { z } from 'zod';

export const VpinConfigSchema = z.object({
  bucketVolume: z.number().positive('Bucket volume must be positive').default(10_000),
  windowBuckets: z.number().int().positive('Window buckets must be positive integer').default(50),
  historicalMean: z.number().min(0).max(1).default(0.25),
  historicalStd: z.number().positive('Historical standard deviation must be positive').default(0.15),
  rollingStatsWindow: z.number().int().positive().default(500),
  minBucketsForMetrics: z.number().int().nonnegative().default(1),
  defaultVpin: z.number().min(0).max(1).default(0.0),
});

export type VpinConfig = z.infer<typeof VpinConfigSchema>;

export interface TradeInput {
  price: number;
  quantity?: number;
  volume?: number;
  timestamp: number;
  side?: 'buy' | 'sell';
  midpoint?: number;
  bidPrice?: number;
  askPrice?: number;
  tradeId?: string;
}

export interface VolumeBucket {
  bucketIndex: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  imbalance: number;
  isComplete: boolean;
  completedAt?: number;
}

export interface VpinMetrics {
  vpin: number;
  zScore: number;
  cdf: number;
  completedBuckets: number;
}

export interface TradeClassificationState {
  side: 'buy' | 'sell';
  lastTradePrice: number;
  lastSign: 'buy' | 'sell';
}

/**
 * Classifies a trade using explicit side, Lee-Ready midpoint rule, or tick rule fallback.
 */
export function classifyTradeTick(
  trade: TradeInput,
  lastTradePrice: number,
  lastSign: 'buy' | 'sell'
): TradeClassificationState {
  if (trade.side === 'buy' || trade.side === 'sell') {
    return { side: trade.side, lastTradePrice: trade.price, lastSign: trade.side };
  }

  let midpoint = trade.midpoint;
  if (midpoint === undefined && trade.bidPrice !== undefined && trade.askPrice !== undefined) {
    if (trade.bidPrice > 0 && trade.askPrice > 0 && trade.bidPrice <= trade.askPrice) {
      midpoint = (trade.bidPrice + trade.askPrice) / 2;
    }
  }

  if (midpoint !== undefined && Number.isFinite(midpoint) && midpoint > 0) {
    if (trade.price > midpoint) {
      return { side: 'buy', lastTradePrice: trade.price, lastSign: 'buy' };
    }
    if (trade.price < midpoint) {
      return { side: 'sell', lastTradePrice: trade.price, lastSign: 'sell' };
    }
  }

  if (lastTradePrice > 0) {
    if (trade.price > lastTradePrice) {
      return { side: 'buy', lastTradePrice: trade.price, lastSign: 'buy' };
    }
    if (trade.price < lastTradePrice) {
      return { side: 'sell', lastTradePrice: trade.price, lastSign: 'sell' };
    }
  }

  return { side: lastSign, lastTradePrice: trade.price, lastSign };
}

/**
 * Computes raw VPIN ratio from completed volume buckets.
 */
export function computeRawVpinFromBuckets(
  completedBuckets: readonly VolumeBucket[],
  defaultVpin: number
): number {
  if (completedBuckets.length === 0) return defaultVpin;
  let totalImbalance = 0;
  let totalVolume = 0;
  for (const b of completedBuckets) {
    totalImbalance += b.imbalance;
    totalVolume += b.totalVolume;
  }
  if (totalVolume <= 0) return defaultVpin;
  const vpin = totalImbalance / totalVolume;
  return Math.max(0, Math.min(1, vpin === 0 ? 0 : vpin));
}

/**
 * Computes normalized VPIN metrics (z-score and normal CDF approximation).
 */
export function computeVpinToxicityMetrics(
  vpin: number,
  vpinHistory: readonly number[],
  completedBucketsCount: number,
  historicalMean: number,
  historicalStd: number
): VpinMetrics {
  let mean = historicalMean;
  let std = historicalStd;
  if (vpinHistory.length >= 30) {
    const sum = vpinHistory.reduce((a, b) => a + b, 0);
    const m = sum / vpinHistory.length;
    const variance = vpinHistory.reduce((a, b) => a + (b - m) ** 2, 0) / vpinHistory.length;
    const s = Math.sqrt(variance);
    if (s > 1e-6) {
      mean = m;
      std = s;
    }
  }
  const zScore = std > 0 ? (vpin - mean) / std : 0;
  const cdf = Math.max(0, Math.min(1, 0.5 * (1 + Math.tanh(zScore * 0.797885))));
  return {
    vpin,
    zScore: Object.is(zScore, -0) ? 0 : zScore,
    cdf: Object.is(cdf, -0) ? 0 : cdf,
    completedBuckets: completedBucketsCount,
  };
}
