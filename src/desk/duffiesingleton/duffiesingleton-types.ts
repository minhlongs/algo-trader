/**
 * Duffie-Singleton (1999) Defaultable Term Structure Types
 *
 * Grounded in Duffie & Singleton (1999) "Modeling Term Structures of Defaultable Bonds".
 * Formulates the Recovery of Market Value (RMV) paradigm where defaultable
 * zero-coupon claims are discounted at adjusted rate R = r + h * (1 - delta).
 *
 * @module desk/duffiesingleton/duffiesingleton-types
 */

export interface DuffieSingletonConfig {
  /** Risk-free continuously compounded short rate (e.g. 0.04 = 4%) */
  riskFreeRate: number;
  /** Hazard rate / default intensity lambda (e.g. 0.02 = 200 bps/yr) */
  hazardRate: number;
  /** Recovery rate delta as fraction of market value immediately prior to default [0, 1] */
  recoveryRate: number;
}

export interface DefaultableCouponPayment {
  /** Payment maturity in years from evaluation date */
  timeToPayment: number;
  /** Coupon payment amount */
  amount: number;
}

export interface DuffieSingletonEstimates {
  /** Effective discount rate R = r + h * (1 - delta) */
  effectiveDiscountRate: number;
  /** Fractional loss given default L = 1 - delta */
  lossGivenDefault: number;
  /** Risk-free discount factor P_0(T) = exp(-r * T) */
  riskFreeDiscount: number;
  /** Defaultable zero-coupon bond price V(0, T) = exp(-R * T) */
  defaultableZeroPrice: number;
  /** Credit spread s(T) = h * (1 - delta) in basis points */
  creditSpreadBps: number;
  /** Yield to maturity y(T) = r + h * (1 - delta) */
  yieldToMaturity: number;
  /** Risk-neutral survival probability under zero recovery: exp(-h * T) */
  survivalProbability: number;
  /** Present value of expected recovery under RMV */
  recoveryComponent: number;
  /** Maturity evaluated in years */
  maturity: number;
}
