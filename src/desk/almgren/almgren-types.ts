export interface LiquidationOrder {
  readonly totalSharesToLiquidate: number;
  readonly totalTimeHorizonHours: number;
  readonly numberOfTradingIntervals: number;
  readonly initialStockPriceUsd: number;
  readonly dailyVolatilityPct: number;
}

export interface MarketImpactParameters {
  readonly permanentImpactGamma: number;   // Price change per share sold ($/share)
  readonly temporaryImpactEta: number;     // Execution penalty per share/hr ($ / (shares/hr))
  readonly riskAversionLambda: number;     // Trader risk aversion coefficient
}

export interface OptimalTrajectoryStep {
  readonly intervalIndex: number;
  readonly timeHours: number;
  readonly remainingShares: number;
  readonly tradeSharesThisInterval: number;
  readonly tradingRateSharesPerHour: number;
}

export interface AlmgrenChrissResult {
  readonly trajectory: OptimalTrajectoryStep[];
  readonly halfLifeHours: number;
  readonly expectedTotalCostUsd: number;
  readonly varianceOfCostUsd: number;
  readonly riskAversionKappa: number;
}
