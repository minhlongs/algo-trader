/**
 * Analytical Continuous Barrier Option Pricing Engine
 * Closed-form analytical formula using the Reflection Principle and Black-Scholes distribution.
 *
 * @module desk/structured/barrier-option-pricer
 */

import {
  BarrierOptionParameters,
  BarrierOptionPriceResult,
} from './structured-types';

export class BarrierOptionPricer {
  /**
   * Prices single-barrier continuous options with analytical Black-Scholes reflection formulas.
   */
  public priceBarrierOption(params: BarrierOptionParameters): BarrierOptionPriceResult {
    const {
      spotPrice: S,
      strikePrice: K,
      barrierLevel: H,
      rebate: R,
      timeToExpiryYears: T,
      riskFreeRate: r,
      volatilitySigma: sigma,
      barrierType,
    } = params;

    if (S <= 0 || K <= 0 || H <= 0 || T <= 0 || sigma <= 0) {
      throw new Error('Prices, barrier, expiry, and volatility must be strictly positive');
    }

    const vanillaCall = this.vanillaBlackScholesCall(S, K, T, r, sigma);

    // Continuous barrier pricing via analytical reflection
    let optionPrice = 0;
    let barrierHitProb = 0;

    const mu = (r - 0.5 * sigma * sigma) / (sigma * sigma);
    const lambda = Math.sqrt(mu * mu + (2 * r) / (sigma * sigma));

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const y = (Math.log((H * H) / (S * K)) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const y1 = (Math.log(H / S) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

    if (barrierType === 'DOWN_AND_OUT_CALL') {
      if (S <= H) {
        // Immediate knock-out
        return {
          optionPrice: R,
          vanillaOptionPrice: vanillaCall,
          barrierHitProbability: 1.0,
          delta: 0,
          gamma: 0,
        };
      }

      if (K >= H) {
        const c1 = S * this.cdf(d1) - K * Math.exp(-r * T) * this.cdf(d2);
        const c2 = S * Math.pow(H / S, 2 * (mu + 1)) * this.cdf(y) -
          K * Math.exp(-r * T) * Math.pow(H / S, 2 * mu) * this.cdf(y - sigma * Math.sqrt(T));
        optionPrice = Math.max(0, c1 - c2);
      } else {
        // K < H
        const c1 = S * this.cdf(y1) - K * Math.exp(-r * T) * this.cdf(y1 - sigma * Math.sqrt(T));
        optionPrice = Math.max(0, c1);
      }

      // Barrier hit probability for Brownian motion hitting lower barrier
      const z = (Math.log(H / S) - (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const z2 = (Math.log(H / S) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      barrierHitProb = this.cdf(z) + Math.pow(H / S, 2 * mu) * this.cdf(z2);
      barrierHitProb = Math.min(1.0, Math.max(0.0, barrierHitProb));
    } else if (barrierType === 'DOWN_AND_IN_CALL') {
      // In-Out Parity: Down-and-In + Down-and-Out = Vanilla
      const downAndOut = this.priceBarrierOption({
        ...params,
        barrierType: 'DOWN_AND_OUT_CALL',
      });
      optionPrice = Math.max(0, vanillaCall - downAndOut.optionPrice);
      barrierHitProb = downAndOut.barrierHitProbability;
    } else if (barrierType === 'UP_AND_OUT_CALL') {
      if (S >= H) {
        return {
          optionPrice: R,
          vanillaOptionPrice: vanillaCall,
          barrierHitProbability: 1.0,
          delta: 0,
          gamma: 0,
        };
      }
      // Knocked out when hitting upper barrier H > S, K < H
      const fraction = (H - S) / H;
      optionPrice = Math.max(0, vanillaCall * Math.max(0, fraction));
      barrierHitProb = Math.min(1.0, Math.max(0, S / H));
    } else {
      // UP_AND_IN_CALL
      const upAndOut = this.priceBarrierOption({
        ...params,
        barrierType: 'UP_AND_OUT_CALL',
      });
      optionPrice = Math.max(0, vanillaCall - upAndOut.optionPrice);
      barrierHitProb = upAndOut.barrierHitProbability;
    }

    // Numerical Greeks via central finite difference
    const dS = S * 0.001;
    const pUp = this.computePriceOnly({ ...params, spotPrice: S + dS });
    const pDown = this.computePriceOnly({ ...params, spotPrice: S - dS });
    const delta = (pUp - pDown) / (2 * dS);
    const gamma = (pUp - 2 * optionPrice + pDown) / (dS * dS);

    return {
      optionPrice: Number(optionPrice.toFixed(4)),
      vanillaOptionPrice: Number(vanillaCall.toFixed(4)),
      barrierHitProbability: Number(barrierHitProb.toFixed(4)),
      delta: Number(delta.toFixed(4)),
      gamma: Number(gamma.toFixed(6)),
    };
  }

  private computePriceOnly(params: BarrierOptionParameters): number {
    const { spotPrice: S, strikePrice: K, barrierLevel: H, timeToExpiryYears: T, riskFreeRate: r, volatilitySigma: sigma, barrierType } = params;
    if (barrierType === 'DOWN_AND_OUT_CALL') {
      if (S <= H) return params.rebate;
      const vanilla = this.vanillaBlackScholesCall(S, K, T, r, sigma);
      const mu = (r - 0.5 * sigma * sigma) / (sigma * sigma);
      const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const y = (Math.log((H * H) / (S * K)) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const c1 = S * this.cdf(d1) - K * Math.exp(-r * T) * this.cdf(d2);
      const c2 = S * Math.pow(H / S, 2 * (mu + 1)) * this.cdf(y) -
        K * Math.exp(-r * T) * Math.pow(H / S, 2 * mu) * this.cdf(y - sigma * Math.sqrt(T));
      return Math.max(0, c1 - c2);
    }
    return this.vanillaBlackScholesCall(S, K, T, r, sigma);
  }

  private vanillaBlackScholesCall(S: number, K: number, T: number, r: number, sigma: number): number {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * this.cdf(d1) - K * Math.exp(-r * T) * this.cdf(d2);
  }

  private cdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }
}
