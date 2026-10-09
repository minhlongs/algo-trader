/**
 * Jarrow-Turnbull (1995) Credit Risk & Risky Debt Model Types
 * Reference: Jarrow, R. A., & Turnbull, S. M. (1995). "Pricing Derivatives
 * on Financial Securities Subject to Credit Risk." The Journal of Finance, 50(1), 53-85.
 */

export interface JarrowTurnbullConfig {
  /** Constant or piecewise risk-free interest rate (annualized, decimal) */
  riskFreeRate: number;
  /** Risk-neutral hazard rate / default intensity lambda (annualized, decimal) */
  hazardRate: number;
  /** Expected recovery rate upon default (delta in [0, 1]) */
  recoveryRate: number;
}

export interface ZeroCouponRiskyBondParams {
  maturity: number;
  faceValue?: number;
}

export interface CdsSpreadParams {
  maturity: number;
  premiumFrequency?: number; // e.g. 4 for quarterly (default), 2 for semiannual, 1 for annual
}

export interface JarrowTurnbullEstimates {
  /** Risk-free discount factor P(0, T) = exp(-r * T) */
  riskFreeDiscount: number;
  /** Default probability Q(tau <= T) = 1 - exp(-lambda * T) */
  defaultProbability: number;
  /** Survival probability Q(tau > T) = exp(-lambda * T) */
  survivalProbability: number;
  /** Price of risky zero-coupon bond v(0, T) */
  riskyBondPrice: number;
  /** Credit spread in bps (y_risky - r) */
  creditSpreadBps: number;
  /** Par Credit Default Swap (CDS) spread in basis points */
  parCdsSpreadBps: number;
  maturity: number;
}
