export interface ReturnSeriesInput {
  readonly assetReturns: number[];
  readonly portfolioValueUsd: number;
  readonly confidenceLevelPct: number;
}

export interface BidAskSpreadProfile {
  readonly meanSpreadBps: number;
  readonly spreadVolBps: number;
}

export interface LVaRResult {
  readonly standardVaRUsd: number;
  readonly exogenousSpreadCostUsd: number;
  readonly totalLiquidityAdjustedVaRUsd: number;
  readonly liquidityAddOnPct: number;
}

export interface FrtbExpectedShortfallResult {
  readonly confidenceLevelPct: number;
  readonly valueAtRiskUsd: number;
  readonly expectedShortfallUsd: number;
  readonly extremeTailIndexXi: number;
  readonly tailSeverityMultiplier: number;
}
