export interface KouModelParameters {
  readonly sigma: number;  // Brownian volatility (sigma > 0)
  readonly lambda: number; // Jump arrival intensity / Poisson rate (lambda > 0)
  readonly p: number;      // Upward jump probability (0 < p < 1)
  readonly eta1: number;   // Upward exponential decay (eta1 > 1 for finite expectation)
  readonly eta2: number;   // Downward exponential decay (eta2 > 0)
}

export interface KouOptionSpec {
  readonly spotPrice: number;
  readonly strikePrice: number;
  readonly timeToExpiryYears: number;
  readonly riskFreeRatePct: number;
  readonly dividendYieldPct?: number;
  readonly isCall: boolean;
}

export interface KouJumpMoments {
  readonly meanJumpSize: number;
  readonly varianceJumpSize: number;
  readonly expectedRelativeJump: number; // kappa = E[e^Y - 1]
}

export interface KouOptionResult {
  readonly optionPrice: number;
  readonly intrinsicValue: number;
  readonly isCall: boolean;
  readonly jumpMoments: KouJumpMoments;
  readonly riskNeutralDrift: number;
}
