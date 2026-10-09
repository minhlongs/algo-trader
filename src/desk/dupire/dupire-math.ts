/**
 * Dupire (1994) Mathematical Derivatives & Black-Scholes Pricing.
 * Finite difference calculus and risk-neutral pricing kernels.
 * Strictly < 180 LOC, zero :any types.
 */

import { DupireDerivatives } from './dupire-types';

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function normCdf(x: number): number {
  if (x === 0) return 0.5;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  // Abramowitz & Stegun polynomial approximation (7.1.26)
  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  const cdf = 1.0 - normPdf(absX) * poly;

  return sign < 0 ? 1.0 - cdf : cdf;
}

export function blackScholesCallPrice(
  spot: number,
  strike: number,
  expiry: number,
  rate: number,
  dividendYield: number,
  vol: number
): number {
  if (expiry <= 0) {
    return Math.max(0, spot - strike);
  }
  if (vol <= 0) {
    const fwd = spot * Math.exp((rate - dividendYield) * expiry);
    return Math.max(0, (fwd - strike) * Math.exp(-rate * expiry));
  }

  const sqrtT = Math.sqrt(expiry);
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + 0.5 * vol * vol) * expiry) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const discS = spot * Math.exp(-dividendYield * expiry);
  const discK = strike * Math.exp(-rate * expiry);

  return discS * normCdf(d1) - discK * normCdf(d2);
}

export function computeDupireDerivatives(
  callPriceFunc: (k: number, t: number) => number,
  strike: number,
  expiry: number,
  rate: number,
  dividendYield: number,
  hK?: number,
  hT?: number
): DupireDerivatives {
  const dK = hK ?? Math.max(0.001 * strike, 0.05);
  const dT = hT ?? Math.max(0.001 * expiry, 0.001);

  const tPlus = expiry + dT;
  const tMinus = Math.max(1e-5, expiry - dT);
  const effectiveDT = (tPlus - tMinus) / 2;

  // Central difference for dC/dT
  const cTPlus = callPriceFunc(strike, tPlus);
  const cTMinus = callPriceFunc(strike, tMinus);
  const dCdT = (cTPlus - cTMinus) / (2 * effectiveDT);

  // Central difference for dC/dK and d2C/dK2
  const cKPlus = callPriceFunc(strike + dK, expiry);
  const cKCenter = callPriceFunc(strike, expiry);
  const cKMinus = callPriceFunc(Math.max(0.01, strike - dK), expiry);

  const dCdK = (cKPlus - cKMinus) / (2 * dK);
  const d2CdK2 = (cKPlus - 2 * cKCenter + cKMinus) / (dK * dK);

  // Dupire numerator: dC/dT + (r - q)*K*(dC/dK) + q*C
  const numerator = dCdT + (rate - dividendYield) * strike * dCdK + dividendYield * cKCenter;
  // Dupire denominator: 0.5 * K^2 * (d^2 C / dK^2)
  const denominator = 0.5 * strike * strike * d2CdK2;

  return {
    dCdT,
    dCdK,
    d2CdK2,
    numerator,
    denominator,
  };
}
