export interface AvellanedaModelParameters {
  readonly midPrice: number;
  readonly currentInventory: number;              // Current inventory q (positive = long, negative = short)
  readonly volatilityDailyPct: number;
  readonly timeHorizonHours: number;              // Total trading horizon T
  readonly elapsedHours: number;                  // Elapsed time t (t <= T)
  readonly inventoryRiskAversionGamma: number;    // Risk aversion gamma > 0
  readonly orderBookLiquidityKappa: number;       // Book density / fill decay kappa > 0
}

export interface AvellanedaQuoteResult {
  readonly reservationPriceUsd: number;
  readonly optimalBidPriceUsd: number;
  readonly optimalAskPriceUsd: number;
  readonly optimalBidSpreadUsd: number;
  readonly optimalAskSpreadUsd: number;
  readonly totalOptimalSpreadUsd: number;
  readonly inventorySkewUsd: number;
  readonly fillProbabilityBid: number;
  readonly fillProbabilityAsk: number;
}
