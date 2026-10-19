/**
 * Wave 266: Cartea & Jaimungal (2017) Ambiguity-Averse Market Making Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface AmbiguityMarketMakingConfig {
  readonly riskAversionGamma: number; // gamma > 0
  readonly ambiguityPenaltyTheta: number; // theta > 0 (Knightian uncertainty parameter)
  readonly orderArrivalKappa: number; // kappa > 0
  readonly assetVolatilitySigma: number; // sigma > 0
  readonly inventory: number; // q (signed inventory)
}

export interface AmbiguityMarketMakingResult {
  readonly optimalBidSpread: number; // delta_b^*
  readonly optimalAskSpread: number; // delta_a^*
  readonly neutralBidSpread: number; // delta_b^{neutral}
  readonly neutralAskSpread: number; // delta_a^{neutral}
  readonly totalSpread: number;
  readonly worstCaseDriftAdjustment: number;
}
