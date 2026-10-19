/**
 * Gatheral (2004) Stochastic Volatility Inspired (SVI) Smile Model Types
 *
 * References:
 * Gatheral, J. (2004). A parsimonious arbitrage-free model of the implied volatility smile.
 * Presentation at the Global Derivatives & Risk Management Conference, Madrid.
 * Gatheral, J., & Jacquier, A. (2014). Arbitrage-free SVI volatility surfaces.
 * Quantitative Finance, 14(1), 59-71.
 *
 * @module desk/gatheralsvi/gatheral-svi-types
 */

export interface SviRawParameters {
  /** Vertical shift of the variance smile (a in R) */
  a: number;
  /** Slope of the wings (b >= 0) */
  b: number;
  /** Skew parameter (-1 < rho < 1) */
  rho: number;
  /** Horizontal shift / translation of the vertex (m in R) */
  m: number;
  /** Smoothness parameter at vertex (sigma > 0) */
  sigma: number;
}

export interface SviNaturalParameters {
  /** Level delta */
  delta: number;
  /** Minimum variance omega */
  omega: number;
  /** Asymmetric slope mu */
  mu: number;
  /** Slope rho */
  rho: number;
  /** Vertex smoothness zeta */
  zeta: number;
}

export interface SviCalibrationPoint {
  /** Log-moneyness k = ln(K / F) */
  logMoneyness: number;
  /** Market observed implied volatility (annualized, e.g. 0.20) */
  marketVol: number;
  /** Weight in objective function (defaults to 1.0) */
  weight?: number;
}

export interface SviArbitrageDiagnostics {
  /** Whether butterfly arbitrage condition g(k) >= 0 holds across checked grid */
  isButterflyArbitrageFree: boolean;
  /** Minimum value of g(k) = (1 - k*w'/2w)^2 - w'^2/4*(1/w + 1/4) + w''/2 */
  minButterflyG: number;
  /** Whether calendar spread arbitrage is satisfied (dw/dt >= 0) if time passed */
  isCalendarArbitrageFree: boolean;
  /** Whether slope condition b * (1 + |rho|) <= 4 / T holds */
  wingSlopeFeasible: boolean;
  /** Worst log-moneyness violation point if any */
  worstMoneynessViolation?: number;
}

export interface SviFitResult {
  /** Calibrated raw SVI parameters */
  params: SviRawParameters;
  /** Time to maturity T */
  timeToMaturity: number;
  /** Mean squared error (MSE) across calibration points */
  mse: number;
  /** Root mean squared error in vol percentage terms */
  rmseVol: number;
  /** Arbitrage diagnostics */
  arbitrageDiagnostics: SviArbitrageDiagnostics;
  /** Number of data points fitted */
  pointCount: number;
}
