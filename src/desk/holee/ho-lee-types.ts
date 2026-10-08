export interface HoLeeModelParameters {
  readonly initialShortRateR0: number; // r(0) in decimal (e.g. 0.04 for 4%)
  readonly volatilitySigma: number;     // sigma > 0 (e.g. 0.015 for 1.5%)
  readonly driftTheta: number;          // theta constant drift (e.g. 0.002)
}

export interface HoLeeBondResult {
  readonly maturityYears: number;
  readonly bondPriceUsd: number;
  readonly yieldPct: number;
  readonly instantaneousForwardRatePct: number;
  readonly varianceFactor: number; // 0.5 * sigma^2 * T^2
}

export interface HoLeeOptionTerms {
  readonly optionExpiryYears: number; // T
  readonly bondMaturityYears: number; // S (S > T)
  readonly strikePriceUsd: number;    // K
}

export interface HoLeeOptionPriceResult {
  readonly callPriceUsd: number;
  readonly putPriceUsd: number;
  readonly forwardBondPriceUsd: number;
  readonly volatilitySigmaP: number;
  readonly d1: number;
  readonly d2: number;
}
