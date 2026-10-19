export interface HestonNandiParams {
  spotPrice: number;        // S_0
  strikePrice: number;      // K
  timeToMaturityDays: number; // T in days (e.g. 252 for 1 year)
  dailyRiskFreeRate: number; // r daily (e.g. 0.05 / 252)
  omega: number;            // GARCH constant omega > 0
  alpha: number;            // GARCH shock weight alpha >= 0
  beta: number;             // GARCH persistence beta >= 0
  gamma: number;            // GARCH asymmetry parameter
  initialVariance?: number; // h_1 (defaults to stationary variance omega/(1 - beta - alpha*gamma^2))
  lambda?: number;          // Risk premium parameter (defaults to 0)
  quadratureSteps?: number; // Steps for numerical Fourier inversion (defaults to 200)
}

export interface HestonNandiResult {
  spotPrice: number;
  strikePrice: number;
  timeToMaturityDays: number;
  callPrice: number;
  putPrice: number;
  stationaryVariance: number;
  initialVariance: number;
  putCallParityError: number;
}
