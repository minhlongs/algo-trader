export interface VarianceGammaMomentsParams {
  readonly spotPrice: number;       // S_0 > 0
  readonly strikePrice: number;     // K > 0
  readonly timeToMaturity: number;  // T > 0 (in years)
  readonly riskFreeRate: number;    // r
  readonly dividendYield: number;   // q
  readonly sigma: number;           // diffusion volatility > 0
  readonly nu: number;              // gamma subordinator variance rate > 0
  readonly theta: number;           // drift of subordinated brownian motion
  readonly isCall?: boolean;        // default true
}

export interface VarianceGammaMomentsAnalytical {
  readonly mean: number;
  readonly variance: number;
  readonly stdDev: number;
  readonly skewness: number;
  readonly excessKurtosis: number;
}

export interface VarianceGammaMomentsOptionResult {
  readonly price: number;
  readonly p1: number;
  readonly p2: number;
  readonly driftCompensatorOmega: number;
  readonly moments: VarianceGammaMomentsAnalytical;
  readonly callPrice: number;
  readonly putPrice: number;
}

export interface Complex {
  readonly re: number;
  readonly im: number;
}
