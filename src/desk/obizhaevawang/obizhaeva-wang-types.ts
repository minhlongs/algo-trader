export interface ObizhaevaWangParams {
  totalQuantity: number;      // Initial order size Q_0 (e.g. 100,000 shares)
  timeHorizon: number;        // Total execution window T in days/hours (e.g. 1.0 day)
  steps: number;              // Discrete execution points N (e.g. 10 intervals)
  resilienceSpeed: number;    // Order book depth recovery rate rho (e.g. 5.0)
  temporaryImpactFactor: number; // Impact coefficient lambda (e.g. 0.0001 $/share^2)
  halfSpread: number;         // Half-spread cost s/2 (e.g. 0.01 $/share)
}

export interface ExecutionSlice {
  step: number;
  time: number;
  tradeSize: number;
  cumulativeQuantity: number;
  remainingQuantity: number;
  sliceImpactCost: number;
}

export interface ObizhaevaWangResult {
  totalQuantity: number;
  timeHorizon: number;
  steps: number;
  tau: number;                // Interval dt = T / N
  resilienceSpeed: number;
  initialBlockTrade: number;  // x_0
  intermediateTrade: number;  // x_k for k=1..N-1
  terminalBlockTrade: number; // x_N
  schedule: ExecutionSlice[];
  optimalTotalCost: number;
  twapTotalCost: number;
  costSavingsAmount: number;
  costSavingsPercent: number;
}
