export interface DistanceToDefaultParams {
  equityValue: number; // E (Observed market equity capitalization)
  equityVolatility: number; // sigma_E (Observed annualized equity volatility)
  debtFaceValue: number; // D (Book value of total liabilities/debt)
  riskFreeRate: number; // r (Risk-free interest rate)
  timeHorizon: number; // T (Debt maturity horizon in years, typically 1.0)
  expectedAssetReturn?: number; // mu (Physical expected return on assets, defaults to r)
}

export interface DistanceToDefaultResult {
  assetValue: number; // V_0 (Implied unobservable asset market value)
  assetVolatility: number; // sigma_V (Implied asset return volatility)
  distanceToDefault: number; // DD = (ln(V/D) + (mu - 0.5*sigma_V^2)*T) / (sigma_V * sqrt(T))
  physicalDefaultProbability: number; // N(-DD)
  riskNeutralDefaultProbability: number; // Q(T) = N(-d2)
  creditSpreadBps: number; // Merton structural continuous CDS spread in basis points: -1/T * ln(1 - LGD * Q)
  leverageRatio: number; // D / V_0
  iterations: number;
  converged: boolean;
}
