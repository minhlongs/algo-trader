export interface LelandToftParams {
  assetValue: number;
  coupon: number;
  principal: number;
  riskFreeRate: number;
  payoutRate?: number;
  assetVolatility: number;
  taxRate: number;
  bankruptcyCostRate: number;
}

export interface LelandToftResult {
  firmValue: number;
  debtValue: number;
  equityValue: number;
  endogenousDefaultBoundary: number;
  defaultDiscountFactor: number;
  taxShieldValue: number;
  bankruptcyCostValue: number;
  creditSpreadBps: number;
  leverageRatio: number;
}
