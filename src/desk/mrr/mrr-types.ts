export interface MrrObservation {
  readonly price: number;       // Execution price or midquote (e.g. in USD or bps)
  readonly signedTrade: number; // +1 for buy, -1 for sell
}

export interface MrrDecompositionResult {
  readonly adverseSelectionTheta: number;      // Information asymmetry parameter theta
  readonly orderProcessingPhi: number;         // Order processing / inventory cost phi
  readonly tradeAutocorrelationRho: number;    // Order flow persistence rho
  readonly impliedHalfSpread: number;          // phi + theta
  readonly adverseSelectionSharePct: number;   // theta / (phi + theta) in %
  readonly orderProcessingSharePct: number;    // phi / (phi + theta) in %
  readonly publicInformationVariance: number;  // sigma_u^2
  readonly sampleSize: number;
}
