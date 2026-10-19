/**
 * Wave 245: Cartea & Jaimungal (2014) Optimal Market Making with Alpha Predictor Types
 * Strictly < 60 LOC, zero :any.
 */

export interface CarteaAlphaMmConfig {
  inventoryQ: number; // Current inventory state
  maxInventoryLimitQBar: number; // Position cap |q| <= Q_bar
  riskAversionGamma: number; // Risk aversion parameter
  orderFlowIntensityLambda: number; // Baseline Poisson arrival intensity
  fillProbabilityKappa: number; // Sensitivity of execution to distance
  shortTermAlphaAlpha: number; // Drift / directional predictor alpha
}

export interface CarteaAlphaQuotes {
  bidHalfSpreadDeltaMinus: number;
  askHalfSpreadDeltaPlus: number;
  effectiveReservationSkew: number;
  totalOptimalSpread: number;
  targetInventorySkewBias: number;
}
