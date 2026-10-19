/**
 * Type definitions for Hasbrouck (1991) Bivariate VAR Trade Impact & VMA Inversion.
 * Strictly < 100 LOC, zero :any.
 */

export interface TradeObservation {
  readonly returnMidquote: number; // r_t: log return of quote midpoint
  readonly tradeSign: number;      // x_t: order sign (+1 buyer, -1 seller, 0 none)
  readonly tradeVolume?: number;   // optional trade volume
}

export interface VarLagCoefficients {
  readonly a_r: number[]; // r_t on r_{t-i}
  readonly a_x: number[]; // r_t on x_{t-i}
  readonly b_r: number[]; // x_t on r_{t-i}
  readonly b_x: number[]; // x_t on x_{t-i}
  readonly c_r: number;   // contemporaneous impact: r_t on x_t
}

export interface HasbrouckVarResult {
  readonly lags: number;
  readonly sampleCount: number;
  readonly coefficients: VarLagCoefficients;
  readonly impulseResponseQuote: number[];  // IRF of quote revisions to trade innovation
  readonly impulseResponseTrades: number[]; // IRF of trades to trade innovation
  readonly permanentPriceImpact: number;     // I_infinity = sum_{i=0}^horizon IRF_r(i)
  readonly randomWalkVariance: number;       // sigma_w^2
  readonly totalReturnVariance: number;      // sigma_r^2
  readonly informationSharePct: number;      // (sigma_w^2 / sigma_r^2) * 100
}

export interface HasbrouckConfig {
  readonly maxLags: number;
  readonly impulseHorizon: number;
}
