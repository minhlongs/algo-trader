export interface KyleAuctionParams {
  priorMean: number; // p_0 (Prior expectation of asset liquidation value v)
  priorVariance: number; // Sigma_0 (Prior variance of liquidation value)
  noiseOrderFlowVariance: number; // sigma_u^2 (Variance of noise trader order flow)
  numPeriods?: number; // Number of trading stages (defaults to 1 for batch auction)
}

export interface KyleBatchAuctionResult {
  lambda: number; // Kyle's lambda: price impact per unit total order flow
  beta: number; // Informed trader's optimal aggressiveness: x = beta * (v - p_0)
  marketDepth: number; // 1 / lambda
  expectedProfit: number; // Expected profit of the informed trader: E[pi]
  residualVariance: number; // Posterior variance of liquidation value: Sigma_1 = 0.5 * Sigma_0
  informationEfficiency: number; // Proportion of information revealed: (Sigma_0 - Sigma_1) / Sigma_0
}

export interface KyleMultiPeriodStep {
  period: number;
  lambda: number;
  beta: number;
  marketDepth: number;
  residualVariance: number;
  cumulativeInfoRevealed: number;
}
