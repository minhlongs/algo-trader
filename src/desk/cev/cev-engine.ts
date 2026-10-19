import { CevOptionParams, CevPricingResult, CevGreeks } from './cev-types.js';
import { CevMath } from './cev-math.js';

export class CevEngine {
  public static validate(params: CevOptionParams): void {
    if (params.spot <= 0) throw new Error('Spot price must be strictly positive');
    if (params.strike <= 0) throw new Error('Strike price must be strictly positive');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be strictly positive');
    if (params.volatility <= 0) throw new Error('Volatility must be strictly positive');
    if (params.beta <= 0 || params.beta > 2.0) throw new Error('Elasticity beta must be in (0, 2.0]');
  }

  public static calculateRawCallPrice(params: CevOptionParams): number {
    this.validate(params);
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, beta } = params;

    // Boundary case: beta = 2 (Geometric Brownian Motion / Black-Scholes)
    if (Math.abs(beta - 2.0) < 1e-4) {
      const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      return S * Math.exp(-q * T) * CevMath.normalCdf(d1) - K * Math.exp(-r * T) * CevMath.normalCdf(d2);
    }

    const alpha = 2.0 - beta;
    const b = r - q;

    let k: number;
    if (Math.abs(b) < 1e-8) {
      k = 2.0 / (sigma * sigma * alpha * T);
    } else {
      k = (2.0 * b) / (sigma * sigma * alpha * (Math.exp(alpha * b * T) - 1.0));
    }

    const x = k * Math.pow(S, alpha) * Math.exp(alpha * b * T);
    const y = k * Math.pow(K, alpha);

    const nu1 = 2.0 + 2.0 / alpha;
    const nu2 = 2.0 / alpha;

    const term1 = S * Math.exp(-q * T) * (1.0 - CevMath.nonCentralChiSquareCdf(2.0 * y, nu1, 2.0 * x));
    const term2 = K * Math.exp(-r * T) * CevMath.nonCentralChiSquareCdf(2.0 * x, nu2, 2.0 * y);

    const callPrice = term1 - term2;
    return Math.max(0, callPrice);
  }

  public static calculatePriceOnly(params: CevOptionParams): number {
    const callPrice = this.calculateRawCallPrice(params);
    if (params.isCall) return callPrice;
    const discountS = params.spot * Math.exp(-params.dividendYield * params.timeToExpiry);
    const discountK = params.strike * Math.exp(-params.riskFreeRate * params.timeToExpiry);
    return Math.max(0, callPrice - discountS + discountK);
  }

  public static price(params: CevOptionParams): CevPricingResult {
    this.validate(params);
    const callPrice = this.calculateRawCallPrice(params);
    const discountS = params.spot * Math.exp(-params.dividendYield * params.timeToExpiry);
    const discountK = params.strike * Math.exp(-params.riskFreeRate * params.timeToExpiry);
    const putPrice = Math.max(0, callPrice - discountS + discountK);

    const price = params.isCall ? callPrice : putPrice;
    const intrinsicValue = params.isCall ? Math.max(0, params.spot - params.strike) : Math.max(0, params.strike - params.spot);

    const greeks = this.calculateGreeks(params, price);

    return {
      price,
      callPrice,
      putPrice,
      intrinsicValue,
      greeks,
      alpha: 2.0 - params.beta,
    };
  }

  private static calculateGreeks(params: CevOptionParams, basePrice: number): CevGreeks {
    const hS = params.spot * 0.01;
    const pUp = this.calculatePriceOnly({ ...params, spot: params.spot + hS });
    const pDown = this.calculatePriceOnly({ ...params, spot: params.spot - hS });
    const delta = (pUp - pDown) / (2.0 * hS);
    const gamma = (pUp - 2.0 * basePrice + pDown) / (hS * hS);

    const hV = 0.01;
    const pVUp = this.calculatePriceOnly({ ...params, volatility: params.volatility + hV });
    const vega = (pVUp - basePrice) / hV;

    const hT = 1.0 / 365.0;
    const pTDown = params.timeToExpiry > hT
      ? this.calculatePriceOnly({ ...params, timeToExpiry: params.timeToExpiry - hT })
      : basePrice;
    const theta = (pTDown - basePrice) / hT;

    const hR = 0.001;
    const pRUp = this.calculatePriceOnly({ ...params, riskFreeRate: params.riskFreeRate + hR });
    const rho = (pRUp - basePrice) / hR;

    const hB = 0.02;
    const pBUp = params.beta + hB <= 2.0
      ? this.calculatePriceOnly({ ...params, beta: params.beta + hB })
      : basePrice;
    const elasticityDelta = (pBUp - basePrice) / hB;

    return { delta, gamma, vega, theta, rho, elasticityDelta };
  }
}
