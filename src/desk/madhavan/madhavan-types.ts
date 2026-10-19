export interface MadhavanParams {
  prices: number[];
  orderSigns: number[]; // -1 for sell, +1 for buy, 0 for neutral
}

export interface MadhavanResult {
  thetaInformationAsymmetry: number;
  phiOrderProcessingCost: number;
  autocorrelationRho: number;
  impliedHalfSpread: number;
  impliedFullSpread: number;
  adverseSelectionShare: number;
  orderProcessingShare: number;
  regressionR2: number;
}
