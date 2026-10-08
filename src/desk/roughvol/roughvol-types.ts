export interface VolatilitySeriesInput {
  readonly assetSymbol: string;
  readonly dailyVolatilityEstimates: number[];
}

export interface HurstEstimationResult {
  readonly hurstParameterH: number;
  readonly isRoughRegime: boolean; // true if H < 0.50
  readonly rSquared: number;
  readonly lagMoments: { lagDelta: number; secondMoment: number }[];
}

export interface RoughVarianceCurvePoint {
  readonly timeToMaturityYears: number;
  readonly forwardVariance: number;
  readonly roughSkewSlope: number;
}
