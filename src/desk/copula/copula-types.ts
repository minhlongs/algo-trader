export interface PairObservation {
  readonly returnX: number;
  readonly returnY: number;
}

export interface CopulaParameters {
  readonly copulaType: 'CLAYTON' | 'GUMBEL' | 'GAUSSIAN';
  readonly parameterTheta: number;
  readonly kendallTau: number;
  readonly lowerTailDependence: number;
  readonly upperTailDependence: number;
}

export interface CopulaSignalResult {
  readonly uPercentileX: number;
  readonly vPercentileY: number;
  readonly conditionalProbabilityYGivenX: number; // P(V <= v | U = u)
  readonly tradeSignal: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'NEUTRAL';
  readonly mispricingScore: number;
}
