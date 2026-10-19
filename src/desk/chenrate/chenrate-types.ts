export interface ChenRateParams {
  currentRate: number; // r_0
  currentMean: number; // theta_0
  currentVariance: number; // sigma_0 (stochastic variance of short rate)
  rateMeanReversion: number; // k
  meanReversionOfMean: number; // alpha
  meanReversionOfVar: number; // beta
  longTermMean: number; // theta_bar
  longTermVar: number; // sigma_bar
  volOfMean: number; // eta
  volOfVar: number; // xi
}

export interface ChenRateResult {
  expectedRate: number; // E[r_T]
  expectedMean: number; // E[theta_T]
  expectedVariance: number; // E[sigma_T]
  asymptoticRate: number; // r_infinity
  zeroBondPrice: number; // P(0, T)
  zeroYield: number; // y(T)
  instantaneousForwardRate: number; // f(0, T)
}
