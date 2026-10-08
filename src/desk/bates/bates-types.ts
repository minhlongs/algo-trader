export interface BatesParams {
  spotPrice: number;      // S0
  initialVariance: number;// v0
  kappa: number;          // Mean reversion speed of variance
  theta: number;          // Long-term variance
  volOfVol: number;       // sigma_v
  rho: number;            // Correlation between price and variance BM
  riskFreeRate: number;   // r
  dividendYield: number;  // q
  
  // Jump parameters (Merton log-normal jump)
  jumpIntensity: number;  // lambda (average number of jumps per year)
  jumpMean: number;       // gamma_j (mean of ln(1+J))
  jumpVol: number;        // delta_j (standard deviation of ln(1+J))
}

export interface BatesOptionParams {
  strike: number;
  timeToMaturity: number;
  isCall: boolean;
}

export interface ComplexNumber {
  re: number;
  im: number;
}
