export interface DuffieSingletonParams {
  riskFreeRate: number;        // Constant risk-free rate r (e.g. 0.04)
  currentIntensity: number;    // Initial hazard rate lambda_0 (e.g. 0.02)
  meanReversion: number;       // Mean reversion speed kappa
  longTermIntensity: number;   // Long-term hazard rate theta
  volatility: number;          // Volatility of intensity sigma_lambda
  lossGivenDefault: number;    // Fractional loss given default L in (0, 1]
  maturities: number[];        // Tenors T in years
}

export interface DuffieSingletonCurvePoint {
  maturity: number;
  defaultFreeBondPrice: number;
  defaultableBondPrice: number;
  creditSpreadBps: number;
  survivalProbability: number;
  cumulativeDefaultProb: number;
  parCdsSpreadBps: number;
}

export interface DuffieSingletonResult {
  curve: DuffieSingletonCurvePoint[];
  instantaneousSpreadBps: number;
  longTermSpreadBps: number;
  fellerConditionSatisfied: boolean;
}
