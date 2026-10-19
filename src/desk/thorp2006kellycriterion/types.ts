export interface Thorp2006KellyInput {
  readonly expectedExcessReturnAnnual: number;
  readonly returnVarianceAnnual: number;
  readonly fractionalMultiplier: number;
  readonly targetDrawdownThreshold: number;
}

export interface Thorp2006KellyOutput {
  readonly fullKellyFraction: number;
  readonly effectiveLeverageFraction: number;
  readonly expectedLogGrowthRate: number;
  readonly drawdownBreachProbability: number;
  readonly drawdownSurvivalProbability: number;
  readonly sizingRegime: 'AGGRESSIVE_HALF_KELLY' | 'INSTITUTIONAL_FRACTIONAL' | 'DEFENSIVE_TAIL_SHIELD';
}
