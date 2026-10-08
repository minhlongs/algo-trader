export interface JarrowTurnbullParams {
  riskFreeRate: number; // Continuous risk-free rate
  hazardRate: number; // Defaults probability intensity (lambda)
  recoveryRate: number; // Expected recovery rate (R) upon default
}

export interface DefaultableBondParams extends JarrowTurnbullParams {
  faceValue: number;
  timeToMaturity: number;
  couponRate?: number; // Annual coupon rate
  paymentFrequency?: number; // Payments per year (e.g., 2 for semi-annual)
}

export interface CreditRiskMetrics {
  survivalProbability: number;
  defaultProbability: number;
  expectedLoss: number;
  creditSpread: number; // In basis points typically, but returned as decimal
  bondPrice: number;
  riskFreePrice: number;
}
