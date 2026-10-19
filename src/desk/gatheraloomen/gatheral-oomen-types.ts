/**
 * Wave 220: Gatheral & Oomen (2010) Zero-Intelligence Order Book Types.
 *
 * Implements high-frequency price dynamics, equilibrium order book depth,
 * and microstructure volatility signature curves.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface GatheralOomenConfig {
  limitOrderArrivalRate: number;      // lambda (shares / sec)
  marketOrderArrivalRate: number;     // mu (shares / sec)
  cancellationRate: number;          // theta (1 / sec)
  tickSize: number;                  // Minimum price increment ($)
  baseVolatilitySigma0: number;       // sigma_0 (annualized or per-sec volatility)
  meanReversionKappa?: number;        // Rate of decay of autocorrelation
}

export interface ZeroIntelligenceMetrics {
  equilibriumDepthShares: number;    // Q_bar = (lambda - mu) / theta
  queueTurnoverRate: number;          // Turnover per second
  expectedSpreadTicks: number;       // Equilibrium spread in ticks
  impliedMicrostructureNoise: number;// High-frequency noise variance ratio
}

export interface VolatilitySignaturePoint {
  lagTimeSec: number;                 // tau (seconds)
  realizedVarianceEstimate: number;  // sigma^2(tau)
  varianceRatio: number;              // sigma^2(tau) / sigma_0^2
}
