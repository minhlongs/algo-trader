export interface ElEuchRosenbaum2019Input {
  readonly hurstExponent: number;
  readonly volOfVolNu: number;
  readonly spotVolCorrelationRho: number;
  readonly spotVarianceV0: number;
  readonly meanReversionLambda: number;
  readonly timeToMaturityYears: number;
}

export interface ElEuchRosenbaum2019Output {
  readonly fractionalAlpha: number;
  readonly shortTermAtmSkewSlope: number;
  readonly fractionalVarianceTermStructure: number;
  readonly roughVolConvexityAdjustment: number;
  readonly surfaceRegime: 'ROUGH_STEEP_SKEW' | 'MODERATE_FRACTIONAL_SKEW' | 'CLASSICAL_MARKOVIAN';
}
