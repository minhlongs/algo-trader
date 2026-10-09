import { Rubinstein83Params, Rubinstein83Result } from './rubinstein83-types.js';
import { Rubinstein83Math } from './rubinstein83-math.js';

export class Rubinstein83Engine {
  public static validate(params: Rubinstein83Params): void {
    if (params.spotPrice <= 0) throw new Error('spotPrice must be positive');
    if (params.strikePrice <= 0) throw new Error('strikePrice must be positive');
    if (params.timeToExpiry <= 0) throw new Error('timeToExpiry must be positive');
    if (params.volatility <= 0) throw new Error('volatility must be positive');
    if (params.displacementAlpha <= 0 || params.displacementAlpha > 1.0) {
      throw new Error('displacementAlpha must be in (0, 1]');
    }
  }

  /**
   * Rubinstein (1983) Displaced Diffusion European Option Pricing
   * Asset is decomposed into a risky component and a riskless fixed borrowing/displacement.
   * Effective stock price S' = S / alpha
   * Effective strike K' = K + ((1 - alpha) / alpha) * S0 * e^{-(r - q)T} (or K + (1-alpha)/alpha * S)
   * Effective volatility sigma' = alpha * sigma
   */
  public static price(params: Rubinstein83Params): Rubinstein83Result {
    this.validate(params);
    const {
      spotPrice: S,
      strikePrice: K,
      timeToExpiry: T,
      riskFreeRate: r,
      dividendYield = 0,
      volatility: sigma,
      displacementAlpha: a,
      isCall,
    } = params;

    const b = r - dividendYield;
    const discount = Math.exp(-r * T);
    const costOfCarryDiscount = Math.exp(-dividendYield * T);
    const sqrtT = Math.sqrt(T);

    // Rubinstein displaced diffusion transformation:
    // S* = S, K* = K + ((1 - a) / a) * S * Math.exp(-b * T) is the adjusted benchmark
    // S_eff = S / a
    // K_eff = K + ((1 - a) / a) * S * Math.exp(b * T) ... standard formulation:
    // Call = a * BS(S/a, K + (1-a)/a * S * e^{-bT}, a * sigma)
    const effS = S / a;
    const effK = K + ((1.0 - a) / a) * S * Math.exp(-b * T);
    const effSigma = a * sigma;

    if (effK <= 0) {
      throw new Error('Displacement resulted in non-positive effective strike');
    }

    const d1 = (Math.log(effS / effK) + (b + 0.5 * effSigma * effSigma) * T) / (effSigma * sqrtT);
    const d2 = d1 - effSigma * sqrtT;

    const Nd1 = Rubinstein83Math.normalCdf(d1);
    const Nd2 = Rubinstein83Math.normalCdf(d2);
    const nNd1 = Rubinstein83Math.normalCdf(-d1);
    const nNd2 = Rubinstein83Math.normalCdf(-d2);
    const pdfD1 = Rubinstein83Math.normalPdf(d1);

    let price = 0;
    if (isCall) {
      const bsCall = effS * Math.exp((b - r) * T) * Nd1 - effK * discount * Nd2;
      price = a * bsCall;
    } else {
      const bsPut = effK * discount * nNd2 - effS * Math.exp((b - r) * T) * nNd1;
      price = a * bsPut;
    }

    const delta = isCall
      ? costOfCarryDiscount * (Nd1 + ((1.0 - a) / a) * (Nd1 - Nd2))
      : costOfCarryDiscount * (-nNd1 - ((1.0 - a) / a) * (nNd1 - nNd2));
    const gamma = (costOfCarryDiscount * pdfD1) / (S * effSigma * sqrtT);
    const vega = S * costOfCarryDiscount * sqrtT * pdfD1;
    const theta = -((S * costOfCarryDiscount * effSigma * pdfD1) / (2 * sqrtT)) - r * price;
    const rho = isCall ? effK * T * discount * Nd2 * a : -effK * T * discount * nNd2 * a;

    const intrinsicValue = isCall
      ? Math.max(0, S - K) * discount
      : Math.max(0, K - S) * discount;

    return {
      optionPrice: Math.max(0, price),
      intrinsicValue,
      timeValue: Math.max(0, price - intrinsicValue),
      effectiveSpot: effS,
      effectiveStrike: effK,
      effectiveVolatility: effSigma,
      d1,
      d2,
      greeks: { delta, gamma, vega, theta, rho },
    };
  }
}
