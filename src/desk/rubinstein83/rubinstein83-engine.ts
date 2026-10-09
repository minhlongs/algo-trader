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

    // Rubinstein (1983) Displaced Diffusion:
    // Underlying S decomposes into risky asset S' = S / a and non-stochastic borrow -(1-a)/a * S * e^{-bT}
    // Payoff at T: max(S_T - K, 0) = max(a * S'_T - (K - (1-a)*S*e^{-bT}), 0)
    // = a * max(S'_T - [K/a + ((a-1)/a)*S*e^{-bT}/a...], 0)
    // Standard formula:
    // C = S * e^{-qT} * Phi(d1) - (a * K + (1-a) * S * e^{bT} ... )
    // Specifically, let S_eff = S / a, K_eff = K + ((1 - a) / a) * S * e^{-b T}, sigma_eff = a * sigma
    // Then C = a * [ S_eff * e^{(b-r)T} * Phi(d1) - K_eff * e^{-rT} * Phi(d2) ]
    // Check C - P:
    // C - P = a * [ S_eff * e^{(b-r)T} - K_eff * e^{-rT} ]
    // = a * [ (S / a) * e^{-q T} - (K + (1-a)/a * S * e^{-(r-q)T}) * e^{-r T} ]
    // Notice: S * e^{-q T} - a * K * e^{-r T} - (1-a) * S * e^{-(2r-q)T} -> not quite S*e^{-qT} - K*e^{-rT}
    // Why? Because the standard Rubinstein (1983) formula uses:
    // Effective strike: K' = K - (1 - a) * S * e^{(r - q)T} or terminal forward displacement:
    // Let forward F = S * e^{bT}. Displaced forward F' = (F - (1-a)F) / a = F.
    // The displaced diffusion S_t + (1-a)/a * S_0 * e^{bt} has lognormal part with forward F/a.
    // In Mark Rubinstein (1983) "Displaced Diffusion Option Pricing":
    // S* = S / a
    // K* = K + ((1 - a) / a) * S * Math.exp(b * T)   <--- Note the compounding e^{bT}, not discounting e^{-bT}!
    // With K* = K + ((1 - a) / a) * S * Math.exp(b * T), discounted strike in BS is:
    // a * K* * e^{-rT} = a * K * e^{-rT} + (1 - a) * S * e^{(b-r)T} = a * K * e^{-rT} + (1 - a) * S * e^{-qT}
    // Then: a * [ S* * e^{(b-r)T} - K* * e^{-rT} ] = S * e^{-qT} - [ a*K*e^{-rT} + (1-a)*S*e^{-qT} ]
    // = a * S * e^{-qT} - a * K * e^{-rT}
    // And for option on S: C = a * BS_Call(S/a, K + (1-a)/a * S * e^{bT}, a * sigma) + (if forward displacement).
    // Or equivalently, Black-Scholes formula with:
    // S_eff = S
    // K_eff = K - (1 - a) * S * exp(b * T) or similar.
    // In Mark Rubinstein (1983), the stock price is S = a * y + (1 - a) * S_0 * e^{bt}, where y follows geometric Brownian motion with y_0 = S_0.
    // Therefore at maturity T: S_T = a * y_T + (1 - a) * S_0 * e^{bT}.
    // S_T - K = a * [ y_T - (K - (1 - a) * S_0 * e^{bT}) / a ].
    // Let K' = (K - (1 - a) * S_0 * e^{bT}) / a.
    // Then C = e^{-rT} E[ max(S_T - K, 0) ] = a * e^{-rT} E[ max(y_T - K', 0) ] = a * BS(S, K', a * sigma, r, b, T).
    // And Put: P = e^{-rT} E[ max(K - S_T, 0) ] = a * e^{-rT} E[ max(K' - y_T, 0) ] = a * BS_Put(S, K', a * sigma, r, b, T).
    // Then C - P = a * [ S * e^{-qT} - K' * e^{-rT} ]
    // = a * S * e^{-qT} - a * [ (K - (1 - a) * S * e^{bT}) / a ] * e^{-rT}
    // = a * S * e^{-qT} - K * e^{-rT} + (1 - a) * S * e^{(b-r)T}
    // Since b = r - q, e^{(b-r)T} = e^{-qT}!
    // = a * S * e^{-qT} - K * e^{-rT} + (1 - a) * S * e^{-qT}
    // = S * e^{-qT} - K * e^{-rT} !!!
    // Put-Call Parity is EXACTLY S * e^{-qT} - K * e^{-rT}!
    const effS = S;
    const effK = (K - (1.0 - a) * S * Math.exp(b * T)) / a;
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
