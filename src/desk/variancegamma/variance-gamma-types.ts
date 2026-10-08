export interface VgModelParameters {
  readonly sigma: number; // Volatility of Brownian motion (sigma > 0)
  readonly nu: number;    // Variance of the gamma time change / subordinator (nu > 0)
  readonly theta: number; // Drift of Brownian motion (skewness control)
}

export interface VgOptionSpec {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly dividendYieldPct?: number;
  readonly isCall: boolean;
}

export interface VgMomentsResult {
  readonly mean: number;
  readonly variance: number;
  readonly skewness: number;
  readonly excessKurtosis: number;
}

export interface VgOptionResult {
  readonly optionPrice: number;
  readonly intrinsicValue: number;
  readonly isCall: boolean;
  readonly moments: VgMomentsResult;
  readonly characteristicPsi: number; // Risk-neutral drift corrector omega
}
