export interface WyartBouchaud2008SpreadImpactInput {
  readonly observedBidAskSpreadTicks: number;
  readonly lagOneResponseImpactTicksR1: number;
  readonly volatilityPerTradeTicksSigma1: number;
  readonly marketMakerCompetitionAlpha?: number;
}

export interface WyartBouchaud2008SpreadImpactOutput {
  readonly equilibriumZeroProfitSpreadTicks: number;
  readonly adverseSelectionRatioSpreadToImpact: number;
  readonly spreadToTradeVolatilityRatio: number;
  readonly marketMakingEdgeTicksPerTrade: number;
  readonly ecologyRegime: 'ADVERSE_SELECTION_LOSS' | 'COMPETITIVE_ZERO_PROFIT' | 'POSITIVE_MM_RENT';
}
