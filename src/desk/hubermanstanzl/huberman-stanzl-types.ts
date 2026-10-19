export interface HubermanStanzlParams {
  permanentImpactGamma: number;   // gamma >= 0
  temporaryImpactTheta: number;   // theta >= 0
  initialPrice: number;           // P_0
  liquidationQuantity: number;    // Total Q_0 to sell/buy
  periods: number;                // Number of execution intervals N
  crossAssetMatrix?: number[][];  // Optional cross-impact matrix Gamma for multi-asset manipulation test
  testRoundTripSchedule?: number[]; // Arbitrary test round-trip strategy
}

export interface RoundTripAnalysis {
  isRoundTrip: boolean;
  netTradedQuantity: number;
  expectedCost: number;
  expectedProfit: number;
  isManipulativeArbitrage: boolean; // True if expectedProfit > 0
}

export interface CrossImpactAnalysis {
  isSymmetric: boolean;
  asymmetryNorm: number;
  isPositiveSemiDefinite: boolean;
  hasCrossAssetManipulation: boolean;
}

export interface OptimalLiquidationResult {
  sliceSize: number;
  totalCost: number;
  totalRevenue: number;
  effectiveAveragePrice: number;
  priceSlippage: number;
}

export interface HubermanStanzlResult {
  permanentImpactGamma: number;
  temporaryImpactTheta: number;
  noManipulationConditionSatisfied: boolean;
  optimalLiquidation: OptimalLiquidationResult;
  roundTripTest?: RoundTripAnalysis;
  crossImpactTest?: CrossImpactAnalysis;
}
