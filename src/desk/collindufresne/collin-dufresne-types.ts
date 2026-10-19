export interface CollinDufresneParams {
  currentLeverage: number; // initial debt-to-firm-value ratio y_0 = ln(F_0 / V_0)
  targetLeverage: number;  // stationary long-run target \bar{y}
  reversionSpeed: number;  // speed of adjustment \lambda > 0
  assetVolatility: number; // \sigma_V > 0
  riskFreeRate: number;    // r
  recoveryRate: number;    // R in [0, 1)
  timeHorizon: number;     // T in years
}

export interface CreditCurvePoint {
  maturity: number;
  survivalProb: number;
  cumulativeDefaultProb: number;
  creditSpreadBps: number;
}

export interface CollinDufresneResult {
  stationaryVariance: number;
  expectedTerminalLeverage: number;
  defaultProbability: number;
  creditSpreadBps: number;
  termStructure: CreditCurvePoint[];
}
