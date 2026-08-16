/**
 * Feature Pipeline Types
 *
 * Causal-only contract: features at timestamp T may only use data at or before T.
 * Non-causal features are rejected by the registry.
 */

export type FeatureSource = 'price' | 'volume' | 'derivatives' | 'market_structure';

export interface FeatureDefinition {
  name: string;
  timeframe: string;
  source: FeatureSource;
  lookback: number; // minimum required historical bars
  /** True if the feature can be computed without future data. */
  causal: boolean;
  description: string;
}

export interface FeatureContext {
  market: string;
  timeframe: string;
  /** Causal slice of candles ending at or before evaluation timestamp. */
  candles: CandleLike[];
}

export interface CandleLike {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Optional derivatives fields; null/undefined when not available. */
  fundingRate?: number | null;
  openInterest?: number | null;
  basis?: number | null;
  liquidationLong?: number | null;
  liquidationShort?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  bidVolume?: number | null;
  askVolume?: number | null;
}

export interface FeatureVector {
  timestamp: string;
  market: string;
  timeframe: string;
  features: Record<string, number | null>;
}

export type FeatureFn = (ctx: FeatureContext) => number | null;