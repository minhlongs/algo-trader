export interface FxOptionPricingTerms {
  readonly spotRate: number;              // Exchange rate (Domestic per 1 Foreign)
  readonly strikeRate: number;
  readonly timeToExpiryYears: number;
  readonly domesticRiskFreeRatePct: number; // r_d
  readonly foreignRiskFreeRatePct: number;  // r_f
  readonly volatilityPct: number;
}

export interface FxOptionPriceResult {
  readonly callPriceDomestic: number;
  readonly putPriceDomestic: number;
  readonly spotDeltaCall: number;
  readonly spotDeltaPut: number;
  readonly forwardRate: number;
  readonly dualVega: number;
}

export interface FxVolSmileDecomposition {
  readonly atmVolPct: number;
  readonly riskReversal25DeltaPct: number;  // 25D Call Vol - 25D Put Vol
  readonly butterfly25DeltaPct: number;     // 0.5 * (25D Call + 25D Put) - ATM Vol
  readonly call25DeltaVolPct: number;
  readonly put25DeltaVolPct: number;
}
