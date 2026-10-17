export interface LaruelleLehalle2013Input {
  readonly parentOrderQuantity: number;
  readonly darkPoolMeanLiquidity: number;
  readonly darkPoolRebateBps: number;
  readonly litHalfSpreadBps: number;
  readonly litLinearImpactBpsPerUnit: number;
  readonly adverseSelectionPenaltyBps: number;
}

export interface LaruelleLehalle2013Output {
  readonly optimalDarkRatio: number;
  readonly darkAllocatedUnits: number;
  readonly litAllocatedUnits: number;
  readonly expectedDarkFillProbability: number;
  readonly expectedTotalCostBps: number;
  readonly costSavingsVsAllLitBps: number;
  readonly executionVenueMode: 'DARK_DOMINANT_STEALTH' | 'BALANCED_DARK_LIT' | 'LIT_URGENT_SWEEP';
}
