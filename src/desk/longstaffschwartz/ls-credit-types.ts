export interface LongstaffSchwartzParams {
  assetValue: number;
  defaultBarrier: number;
  maturity: number;
  writeDownFraction: number; // w in [0, 1]
  shortRate: number; // r0
  meanReversionSpeed: number; // a
  longTermRate: number; // b
  rateVol: number; // sigma_r
  assetVol: number; // sigma_v
  correlation: number; // rho
}

export interface LongstaffSchwartzResult {
  risklessBondPrice: number;
  defaultableBondPrice: number;
  expectedLossDiscount: number;
  defaultEventPv: number;
  risklessYield: number;
  defaultableYield: number;
  creditSpreadBps: number;
  distanceToDefault: number;
}
