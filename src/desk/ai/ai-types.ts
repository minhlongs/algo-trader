/**
 * Neural Time-Series & Feature Pipeline Types
 *
 * @module desk/ai/ai-types
 */

export interface StateSpaceModelConfig {
  readonly stateDimension: number;
  readonly transitionDecay: number;
  readonly observationWeight: number;
  readonly processNoiseVar: number;
}

export interface StateSpacePrediction {
  readonly stepAhead: number;
  readonly predictedReturn: number;
  readonly confidenceLower: number;
  readonly confidenceUpper: number;
  readonly stateVector: readonly number[];
}

export interface MarketFeatureVector {
  readonly timestampMs: number;
  readonly symbol: string;
  readonly returnZScore: number;
  readonly normalizedSpread: number;
  readonly orderBookImbalance: number;
  readonly volumeIntensity: number;
  readonly realizedVolAnnualized: number;
}

export interface TransformerRegimeAttention {
  readonly attentionWeights: readonly number[];
  readonly dominantLookbackLag: number;
  readonly predictedRegime: 'TRENDING_BULL' | 'TRENDING_BEAR' | 'MEAN_REVERTING' | 'VOLATILE_CHOP';
  readonly regimeProbability: number;
}
