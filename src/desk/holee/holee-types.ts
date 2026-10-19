export interface HoLeeParams {
  shortRate: number; // Current instantaneous short rate r(0)
  rateVolatility: number; // Sigma (annualized short rate vol)
  thetaCurve?: (t: number) => number; // Time-dependent drift theta(t), defaults to constant or analytical fit
}

export interface HoLeeBondResult {
  maturity: number;
  zeroBondPrice: number;
  zeroYield: number;
  instantaneousForwardRate: number;
}

export interface HoLeeOptionParams {
  bondMaturity: number; // T
  optionExpiry: number; // t (t < T)
  strikePrice: number; // K
  shortRate: number;
  rateVolatility: number;
  isCall: boolean;
}

export interface HoLeeOptionResult {
  optionPrice: number;
  bondPriceT: number;
  bondPricet: number;
  strikePrice: number;
  d1: number;
  d2: number;
}
