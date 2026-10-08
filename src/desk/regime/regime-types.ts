/**
 * Volatility & Covariance Regime-Switching Desk Types
 *
 * @module desk/regime/regime-types
 */

export type MarketRegime = 'CALM' | 'VOLATILE' | 'CRISIS';

export interface RegimeParameters {
  readonly state: MarketRegime;
  readonly meanReturn: number;
  readonly volatility: number; // Daily standard deviation
}

export interface FilteredRegimeEstimate {
  readonly probabilities: Record<MarketRegime, number>;
  readonly dominantRegime: MarketRegime;
  readonly confidencePct: number;
  readonly suggestedDeleveragingFactor: number; // [0, 1] multiplier on position sizing
}

export interface DccCorrelationState {
  readonly assetPairs: string[];
  readonly correlationMatrix: number[][];
  readonly averageCorrelation: number;
  readonly isCorrelationBreakdown: boolean; // Flagged when correlation spikes sharply
}
