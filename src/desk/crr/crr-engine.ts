/**
 * Cox-Ross-Rubinstein (1979) Option Pricing Engine
 * Handles European and American exercise features, lattice Greeks, and early exercise premium.
 */

import { CRROptionParams, CRROptionResult, CRRGreeks } from './crr-types.js';
import { CRRMath } from './crr-math.js';

export class CRREngine {
  public static validate(params: CRROptionParams): void {
    if (params.spotPrice <= 0) throw new Error('spotPrice must be positive');
    if (params.strikePrice <= 0) throw new Error('strikePrice must be positive');
    if (params.timeToExpiry <= 0) throw new Error('timeToExpiry must be positive');
    if (params.volatility <= 0) throw new Error('volatility must be positive');
    if (!params.steps || params.steps < 2) throw new Error('steps must be at least 2');
  }

  public static price(params: CRROptionParams, computeGreeks: boolean = true): CRROptionResult {
    this.validate(params);
    const {
      spotPrice: S,
      strikePrice: K,
      timeToExpiry: T,
      riskFreeRate: r,
      dividendYield: q = 0,
      volatility: sigma,
      steps: N,
      isCall,
      isAmerican = false,
    } = params;

    const dt = T / N;
    const { u, d } = CRRMath.computeFactors(sigma, dt);
    const p = CRRMath.computeRiskNeutralProb(u, d, r, q, dt);
    const df = Math.exp(-r * dt);

    // Terminal payoffs at step N
    let values = new Array(N + 1);
    for (let j = 0; j <= N; j++) {
      const spotAtNode = S * Math.pow(u, j) * Math.pow(d, N - j);
      values[j] = isCall ? Math.max(0, spotAtNode - K) : Math.max(0, K - spotAtNode);
    }

    // Saved values for lattice Greeks (at step 2 and step 1)
    let valStep2: number[] = [];
    let valStep1: number[] = [];

    // Backward induction
    for (let step = N - 1; step >= 0; step--) {
      const nextValues = new Array(step + 1);
      for (let j = 0; j <= step; j++) {
        const continuationVal = df * (p * values[j + 1] + (1 - p) * values[j]);
        if (isAmerican) {
          const spotAtNode = S * Math.pow(u, j) * Math.pow(d, step - j);
          const intrinsicVal = isCall ? Math.max(0, spotAtNode - K) : Math.max(0, K - spotAtNode);
          nextValues[j] = Math.max(continuationVal, intrinsicVal);
        } else {
          nextValues[j] = continuationVal;
        }
      }
      values = nextValues;
      if (step === 2) valStep2 = [...values];
      if (step === 1) valStep1 = [...values];
    }

    const optionPrice = values[0];

    // Compute European price for comparison if American
    let europeanPrice = optionPrice;
    if (isAmerican) {
      const eurRes = this.price({ ...params, isAmerican: false }, false);
      europeanPrice = eurRes.optionPrice;
    }
    const earlyExercisePremium = isAmerican ? Math.max(0, optionPrice - europeanPrice) : 0;

    // Lattice Greeks:
    let greeks: CRRGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    if (computeGreeks && valStep1.length === 2 && valStep2.length === 3) {
      const S_u = S * u;
      const S_d = S * d;
      const delta = (valStep1[1] - valStep1[0]) / (S_u - S_d);

      const S_uu = S * u * u;
      const S_ud = S * u * d;
      const S_dd = S * d * d;
      const delta_u = (valStep2[2] - valStep2[1]) / (S_uu - S_ud);
      const delta_d = (valStep2[1] - valStep2[0]) / (S_ud - S_dd);
      const gamma = (delta_u - delta_d) / (0.5 * (S_uu - S_dd));

      const theta = (valStep2[1] - optionPrice) / (2 * dt); // per year

      // Finite difference vega and rho
      const bumpedVolPrice = this.price({ ...params, volatility: sigma + 0.01 }, false).optionPrice;
      const vega = (bumpedVolPrice - optionPrice) / 0.01;

      const bumpedRatePrice = this.price({ ...params, riskFreeRate: r + 0.0001 }, false).optionPrice;
      const rho = (bumpedRatePrice - optionPrice) / 0.0001;

      greeks = { delta, gamma, theta, vega, rho };
    }

    return {
      optionPrice,
      steps: N,
      upFactor: u,
      downFactor: d,
      riskNeutralProb: p,
      earlyExercisePremium,
      greeks,
    };
  }
}
