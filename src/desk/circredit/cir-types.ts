export interface CirFactor {
  speedKappa: number;
  meanTheta: number;
  sigma: number;
  currentX: number;
  rateWeight: number; // delta_{1, i}
  defaultWeight: number; // lambda_{1, i}
}

export interface CirModelParams {
  factors: CirFactor[];
  baseRate: number; // delta_0
  baseDefaultIntensity: number; // lambda_0
  recoveryRate: number; // R in [0, 1]
}

export interface CirBondResult {
  tau: number;
  risklessPrice: number;
  risklessYield: number;
  defaultablePrice: number;
  defaultableYield: number;
  creditSpreadBps: number;
  survivalProbability: number;
}

export interface CirTermStructure {
  maturities: number[];
  curve: CirBondResult[];
}
