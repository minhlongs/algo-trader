/**
 * Carr-Madan (1998) Static Replication & Barrier Reflection Math
 *
 * Implements:
 * 1. Black-Scholes analytical pricing & cumulative standard normal
 * 2. Carr-Madan (1998) spanning theorem discretization with trapezoidal integration
 * 3. Discrete strike Tikhonov-style regularization for ill-conditioned strike weights
 * 4. Carr-Ellis-Gupta (1998) put-call symmetry and boundary reflection parity
 *
 * @module desk/carrmadan/carr-madan-static-math
 */

import { OptionType } from './carr-madan-static-types';

export class CarrMadanMath {
  /** Cumulative standard normal distribution approximation (Abramowitz & Stegun 26.2.17) */
  static normalCdf(x: number): number {
    const b1 = 0.31938153;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c2 = 0.3989422804014327; // 1 / sqrt(2 * pi)

    if (x >= 0) {
      const t = 1.0 / (1.0 + p * x);
      return 1.0 - c2 * Math.exp(-0.5 * x * x) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    } else {
      const t = 1.0 / (1.0 - p * x);
      return c2 * Math.exp(-0.5 * x * x) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
    }
  }

  /** Standard Black-Scholes analytical option formula */
  static blackScholesPrice(
    spot: number,
    strike: number,
    maturity: number,
    volatility: number,
    rate: number,
    dividendYield: number,
    type: OptionType,
  ): number {
    if (maturity <= 0) {
      return type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    }
    if (volatility <= 0) {
      const dfR = Math.exp(-rate * maturity);
      const dfQ = Math.exp(-dividendYield * maturity);
      const fwd = spot * dfQ / dfR;
      return type === 'call' ? Math.max(fwd - strike, 0) * dfR : Math.max(strike - fwd, 0) * dfR;
    }

    const sqrtT = Math.sqrt(maturity);
    const d1 = (Math.log(spot / strike) + (rate - dividendYield + 0.5 * volatility * volatility) * maturity) / (volatility * sqrtT);
    const d2 = d1 - volatility * sqrtT;
    const dfQ = Math.exp(-dividendYield * maturity);
    const dfR = Math.exp(-rate * maturity);

    return type === 'call'
      ? spot * dfQ * this.normalCdf(d1) - strike * dfR * this.normalCdf(d2)
      : strike * dfR * this.normalCdf(-d2) - spot * dfQ * this.normalCdf(-d1);
  }

  /** Regularized trapezoidal weights for discrete strike spacing */
  static computeDiscreteWeights(
    strikes: number[],
    evaluator: (k: number) => number,
    regularizationLambda = 0,
  ): { strike: number; weight: number }[] {
    const n = strikes.length;
    if (n === 0) return [];
    if (n === 1) return [{ strike: strikes[0]!, weight: evaluator(strikes[0]!) }];

    const sorted = [...strikes].sort((a, b) => a - b);
    const weights: { strike: number; weight: number }[] = [];

    for (let i = 0; i < n; i++) {
      const k = sorted[i]!;
      const dK = i === 0
        ? (sorted[1]! - sorted[0]!) * 0.5
        : i === n - 1
          ? (sorted[n - 1]! - sorted[n - 2]!) * 0.5
          : (sorted[i + 1]! - sorted[i - 1]!) * 0.5;

      const rawWeight = evaluator(k) * dK;
      const dampedWeight = regularizationLambda > 0
        ? rawWeight / (1.0 + regularizationLambda * Math.abs(rawWeight))
        : rawWeight;

      weights.push({ strike: k, weight: dampedWeight });
    }

    return weights;
  }

  /** Carr-Ellis-Gupta reflection multiplier power exponent: p = 1 - 2 * (r - q) / sigma^2 */
  static computeReflectionPower(rate: number, dividendYield: number, volatility: number): number {
    const varS = volatility * volatility;
    return varS < 1e-12 ? 1.0 : 1.0 - (2.0 * (rate - dividendYield)) / varS;
  }

  /** Reflected strike: K' = H^2 / K */
  static computeReflectedStrike(barrier: number, strike: number): number {
    if (strike <= 0) throw new Error('Strike must be strictly positive');
    return (barrier * barrier) / strike;
  }

  /** Analytical down-and-out call barrier price for benchmark comparison (Reiner & Rubinstein 1991) */
  static analyticalDownAndOutCall(
    spot: number,
    strike: number,
    barrier: number,
    maturity: number,
    volatility: number,
    rate: number,
    dividendYield: number,
  ): number {
    if (spot <= barrier) return 0;
    const vanillaCall = this.blackScholesPrice(spot, strike, maturity, volatility, rate, dividendYield, 'call');
    const lambda = (rate - dividendYield + 0.5 * volatility * volatility) / (volatility * volatility);
    const sqrtT = Math.sqrt(maturity);

    const y = (Math.log((barrier * barrier) / (spot * strike)) + (rate - dividendYield + 0.5 * volatility * volatility) * maturity) / (volatility * sqrtT);
    const y2 = y - volatility * sqrtT;
    const dfQ = Math.exp(-dividendYield * maturity);
    const dfR = Math.exp(-rate * maturity);

    const downInCall = spot * dfQ * Math.pow(barrier / spot, 2 * lambda) * this.normalCdf(y)
      - strike * dfR * Math.pow(barrier / spot, 2 * lambda - 2) * this.normalCdf(y2);

    return Math.max(0, vanillaCall - downInCall);
  }
}
