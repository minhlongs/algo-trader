export interface KmvParams {
  equityValue: number;       // E: market cap of equity
  equityVolatility: number;  // sigma_E: annualized equity volatility
  debtFaceValue: number;     // D: default point (face value of total debt)
  timeHorizon: number;       // T: debt maturity horizon (years)
  riskFreeRate: number;      // r: risk-free rate
  assetDrift?: number;       // mu: expected return on assets (defaults to r)
  recoveryRate?: number;     // R: expected recovery rate on debt (default 0.40)
}

export interface KmvResult {
  assetValue: number;               // V: calibrated firm asset value
  assetVolatility: number;          // sigma_V: calibrated asset return volatility
  distanceToDefault: number;        // DD: number of standard deviations to default
  expectedDefaultFrequency: number; // EDF: default probability N(-DD)
  riskyDebtValue: number;           // B = V - E: fair value of debt
  creditSpreadBps: number;          // Fair yield spread over risk-free rate (bps)
  leverageRatio: number;            // D * exp(-r*T) / V
  iterations: number;               // Convergence iterations
}
