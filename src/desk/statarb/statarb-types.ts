/**
 * Statistical Arbitrage Graph & Pair Trading Types
 * Cointegration clusters, Ornstein-Uhlenbeck parameters, and Z-score state machine signals.
 *
 * @module desk/statarb/statarb-types
 */

export interface PairPriceSeries {
  symbolA: string;
  symbolB: string;
  pricesA: number[];
  pricesB: number[];
}

export interface OuParameters {
  theta: number; // Mean reversion speed (annualized or per step)
  mu: number; // Long-term equilibrium spread level
  sigma: number; // Volatility of the spread process
  halfLifePeriods: number; // ln(2) / theta
  equilibriumVariance: number; // sigma^2 / (2 * theta)
}

export interface CointegrationPairResult {
  symbolA: string;
  symbolB: string;
  hedgeRatio: number; // beta from OLS regression A = alpha + beta * B
  intercept: number;
  residualSpread: number[];
  ouParameters: OuParameters;
  isCointegrated: boolean;
}

export interface StatArbSignal {
  timestampIndex: number;
  spreadValue: number;
  zScore: number;
  action: 'LONG_SPREAD' | 'SHORT_SPREAD' | 'CLOSE' | 'STOP_LOSS' | 'HOLD';
  targetWeightA: number;
  targetWeightB: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  distance: number; // sqrt(2 * (1 - correlation))
  correlation: number;
}
