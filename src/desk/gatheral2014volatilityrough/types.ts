export interface Gatheral2014VolatilityRoughInput {
  readonly lagFineDaysDelta1: number;
  readonly lagCoarseDaysDelta2: number;
  readonly variogramMomentLag1: number;
  readonly variogramMomentLag2: number;
  readonly momentOrderQ: number;
}

export interface Gatheral2014VolatilityRoughOutput {
  readonly estimatedHurstExponentH: number;
  readonly roughnessIndexAlpha: number;
  readonly scalingRatio: number;
  readonly atmSkewPowerLawExponent: number;
  readonly regime: 'ROUGH_FRACTIONAL' | 'DIFFUSIVE_BROWNIAN' | 'LONG_MEMORY_PERSISTENT';
}
