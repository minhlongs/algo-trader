/**
 * Example 4: Multi-Indicator Confluence Strategy — Types
 */

export interface IndicatorSignals {
  trend: number; // -1 (bearish), 0 (neutral), +1 (bullish)
  momentum: number; // 0-1 confidence
  volatility: number; // 0-1 (0=low, 1=high)
  volume: number; // -1 to +1
}

export interface MultiIndicatorOptions {
  emaFast?: number;
  emaSlow?: number;
  rsiPeriod?: number;
  minConfluence?: number;
  volatilityThreshold?: number;
}

export interface ConfluenceResult {
  buyScore: number;
  sellScore: number;
  agreeing: number;
}
