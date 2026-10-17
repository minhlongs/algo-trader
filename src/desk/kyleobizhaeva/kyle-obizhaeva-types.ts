/**
 * Wave 217: Kyle & Obizhaeva (2016) Market Microstructure Invariance Types.
 *
 * Implements structural invariance scaling across trading volume, trade size,
 * transaction costs, and bet size distribution.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export interface MicrostructureInvarianceConfig {
  spotPrice: number;                  // P ($)
  averageDailyVolume: number;         // ADV (shares / day)
  dailyVolatility: number;            // sigma_d (e.g. 0.02 for 2%)
  tradingDaysPerYear?: number;        // Default 252
  calibrationConstantGamma?: number;  // Gamma scaling constant (default 0.25)
}

export interface InvarianceScaleMetrics {
  dollarVolumeUsd: number;            // P * ADV
  dollarVolatilityW: number;          // W = (P * ADV / 10^6) * sigma
  tradingVelocityV: number;           // V = P * ADV / 10^6
  characteristicBetSizeShares: number;// Q_*
  characteristicBetSizeUsd: number;   // Q_* * P
  expectedBetsPerDay: number;         // N_* = ADV / Q_*
  spreadEstimateBps: number;          // Invariant bid-ask spread in bps
}

export interface OrderImpactEvaluation {
  orderSizeShares: number;            // Q
  normalizedSizeRatio: number;        // Q / Q_*
  expectedImpactBps: number;          // Price impact in basis points
  totalExecutionCostUsd: number;      // Total dollar cost
  invarianceScaleRegime: 'MICRO_ORDER' | 'NORMAL_BET' | 'LARGE_BLOCK';
}
