import { KirkSpreadParams, KirkSpreadResult } from './kirkspread-types.js';
import { KirkSpreadMath } from './kirkspread-math.js';

export class KirkSpreadEngine {
  public static validate(params: KirkSpreadParams): void {
    if (params.asset1Forward <= 0) throw new Error('Asset 1 forward must be positive');
    if (params.asset2Forward <= 0) throw new Error('Asset 2 forward must be positive');
    if (params.strike < 0) throw new Error('Strike must be non-negative');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be positive');
    if (params.volatility1 <= 0 || params.volatility2 <= 0) {
      throw new Error('Volatilities must be positive');
    }
    if (params.correlation < -1 || params.correlation > 1) {
      throw new Error('Correlation must be between -1 and 1');
    }
  }

  /**
   * Prices a spread option using Kirk (1995) approximation.
   * Call Payoff: max(F1 - F2 - K, 0)
   * Put Payoff: max(K - (F1 - F2), 0)
   */
  public static price(params: KirkSpreadParams): KirkSpreadResult {
    this.validate(params);
    const {
      asset1Forward: F1,
      asset2Forward: F2,
      strike: K,
      timeToExpiry: T,
      riskFreeRate: r,
      volatility1: s1,
      volatility2: s2,
      correlation: rho,
      isCall,
    } = params;

    const discount = Math.exp(-r * T);
    const sqrtT = Math.sqrt(T);
    const denom = F2 + K;
    const sigmaStar = KirkSpreadMath.calculateAdjustedVolatility(F1, F2, K, s1, s2, rho);

    const d1 = (Math.log(F1 / denom) + 0.5 * sigmaStar * sigmaStar * T) / (sigmaStar * sqrtT);
    const d2 = d1 - sigmaStar * sqrtT;

    const Nd1 = KirkSpreadMath.normalCdf(d1);
    const Nd2 = KirkSpreadMath.normalCdf(d2);
    const nNd1 = KirkSpreadMath.normalCdf(-d1);
    const nNd2 = KirkSpreadMath.normalCdf(-d2);
    const pdfD1 = KirkSpreadMath.normalPdf(d1);

    let price = 0;
    let delta1 = 0;
    let delta2 = 0;

    if (isCall) {
      price = discount * (F1 * Nd1 - denom * Nd2);
      delta1 = discount * Nd1;
      delta2 = -discount * Nd2 * (F2 / denom);
    } else {
      price = discount * (denom * nNd2 - F1 * nNd1);
      delta1 = -discount * nNd1;
      delta2 = discount * nNd2 * (F2 / denom);
    }

    const gamma = (discount * pdfD1) / (F1 * sigmaStar * sqrtT);
    const vega = discount * F1 * sqrtT * pdfD1;
    const theta = -((discount * F1 * sigmaStar * pdfD1) / (2 * sqrtT)) - r * price;
    const rhoGreek = -T * price;

    const spreadDiff = F1 - F2;
    const intrinsicValue = isCall
      ? Math.max(0, spreadDiff - K) * discount
      : Math.max(0, K - spreadDiff) * discount;

    return {
      optionPrice: Math.max(0, price),
      intrinsicValue,
      timeValue: Math.max(0, price - intrinsicValue),
      adjustedVolatility: sigmaStar,
      d1,
      d2,
      greeks: { delta1, delta2, gamma, vega, theta, rho: rhoGreek },
    };
  }
}
