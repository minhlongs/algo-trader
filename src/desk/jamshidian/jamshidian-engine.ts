import { JamshidianParams, JamshidianResult } from './jamshidian-types.js';
import { JamshidianMath } from './jamshidian-math.js';

export class JamshidianEngine {
  public static validate(params: JamshidianParams): void {
    if (params.strike <= 0) throw new Error('Strike must be positive');
    if (params.expiry <= 0) throw new Error('Option expiry must be positive');
    if (params.meanReversion <= 0) throw new Error('Mean reversion kappa must be positive');
    if (params.volatility <= 0) throw new Error('Volatility sigma must be positive');
    if (!params.cashFlows || params.cashFlows.length === 0) {
      throw new Error('Bond must have at least one cash flow');
    }
    for (const cf of params.cashFlows) {
      if (cf.time <= params.expiry) {
        throw new Error('All cash flows must occur after option expiry T');
      }
    }
  }

  /**
   * Evaluates coupon bond value at expiry T given short rate r:
   * V(r, T) = sum c_i * P(r, t_i - T)
   */
  private static couponBondValue(
    r: number,
    T: number,
    params: JamshidianParams
  ): number {
    const { meanReversion: k, longTermRate: theta, volatility: sigma, cashFlows } = params;
    let sum = 0;
    for (const cf of cashFlows) {
      const tau = cf.time - T;
      const P = JamshidianMath.vasicekZeroBond(r, tau, k, theta, sigma);
      sum += cf.amount * P;
    }
    return sum;
  }

  /**
   * Solves for critical short rate r* such that V(r*, T) = K via Newton-Raphson / Bisection
   */
  public static findCriticalRate(params: JamshidianParams): number {
    let low = -0.5;
    let high = 0.5;

    // Expand search bracket if needed
    for (let step = 0; step < 10; step++) {
      const vLow = this.couponBondValue(low, params.expiry, params);
      const vHigh = this.couponBondValue(high, params.expiry, params);
      if (vLow >= params.strike && vHigh <= params.strike) break;
      low -= 0.5;
      high += 0.5;
    }

    // Bisection solver for monotonic bond value function
    for (let iter = 0; iter < 50; iter++) {
      const mid = 0.5 * (low + high);
      const val = this.couponBondValue(mid, params.expiry, params);
      if (Math.abs(val - params.strike) < 1e-9) return mid;
      if (val > params.strike) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return 0.5 * (low + high);
  }

  /**
   * Prices European call or put option on coupon bond using Jamshidian decomposition:
   * Option = sum c_i * OptionOnZeroCouponBond(K_i = P(r*, t_i - T))
   */
  public static price(params: JamshidianParams): JamshidianResult {
    this.validate(params);
    const { strike: K, expiry: T, shortRate: r0, meanReversion: k, longTermRate: theta, volatility: sigma, cashFlows, isCall } = params;

    const rStar = this.findCriticalRate(params);
    const P0T = JamshidianMath.vasicekZeroBond(r0, T, k, theta, sigma);

    let optionPrice = 0;
    let underlyingBondPrice = 0;

    for (const cf of cashFlows) {
      const ti = cf.time;
      const tau = ti - T;
      const P0ti = JamshidianMath.vasicekZeroBond(r0, ti, k, theta, sigma);
      const Ki = JamshidianMath.vasicekZeroBond(rStar, tau, k, theta, sigma);

      underlyingBondPrice += cf.amount * P0ti;

      // Volatility of zero coupon bond forward price:
      // sigma_P = (sigma / k) * (1 - exp(-k * (ti - T))) * sqrt((1 - exp(-2 * k * T)) / (2 * k))
      const B_tau = JamshidianMath.vasicekB(tau, k);
      const varTerm = (1.0 - Math.exp(-2.0 * k * T)) / (2.0 * k);
      const sigmaP = sigma * B_tau * Math.sqrt(varTerm);

      const d1 = (Math.log(P0ti / (P0T * Ki)) + 0.5 * sigmaP * sigmaP) / sigmaP;
      const d2 = d1 - sigmaP;

      let zeroOption = 0;
      if (isCall) {
        zeroOption = P0ti * JamshidianMath.normalCdf(d1) - P0T * Ki * JamshidianMath.normalCdf(d2);
      } else {
        zeroOption = P0T * Ki * JamshidianMath.normalCdf(-d2) - P0ti * JamshidianMath.normalCdf(-d1);
      }

      optionPrice += cf.amount * zeroOption;
    }

    const intrinsicValue = isCall
      ? Math.max(0, underlyingBondPrice - K * P0T)
      : Math.max(0, K * P0T - underlyingBondPrice);

    return {
      optionPrice: Math.max(0, optionPrice),
      criticalRate: rStar,
      underlyingBondPrice,
      intrinsicValue,
    };
  }
}
