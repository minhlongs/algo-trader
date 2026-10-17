/**
 * Carr-Wu (2004) Finite Moment Log-Stable (FMLS) Mathematics
 *
 * @module desk/carrwu/carr-wu-math
 */

import type { CarrWuParams } from './carr-wu-types';

export class CarrWuMath {
  public static computeConvexityAdjustment(alpha: number, sigma: number): number {
    if (alpha <= 1 || alpha > 2) throw new Error(`Alpha must be in (1, 2], got ${alpha}`);
    if (sigma <= 0) throw new Error(`Sigma must be positive, got ${sigma}`);
    const denom = Math.cos((Math.PI * alpha) / 2);
    return -(Math.pow(sigma, alpha) / denom);
  }

  public static evaluateProbabilities(
    spot: number,
    strike: number,
    T: number,
    params: CarrWuParams,
    nSteps = 200,
    uMax = 100,
  ): { pi1: number; pi2: number } {
    const { alpha, sigma, rate: r, dividendYield: q } = params;
    const omega = this.computeConvexityAdjustment(alpha, sigma);
    const k = Math.log(strike / spot);
    const du = uMax / nSteps;

    let int1 = 0;
    let int2 = 0;

    for (let i = 1; i < nSteps; i++) {
      const u = i * du;
      const weight = i % 2 === 0 ? 2 : 4;

      // Pi2 integrand: Im(phi(u) * exp(-i*u*k)) / u
      const rePsi = -T * Math.pow(sigma, alpha) * Math.pow(u, alpha);
      const imPsi = u * (r - q - omega) * T - T * Math.pow(sigma, alpha) * Math.pow(u, alpha) * Math.tan((Math.PI * alpha) / 2);
      const mag = Math.exp(rePsi);
      const phase = imPsi - u * k;
      const f2 = (mag * Math.sin(phase)) / u;

      // Pi1 integrand: Im(phi1(u) * exp(-i*u*k)) / u
      const r_mod = Math.sqrt(1 + u * u);
      const theta = Math.atan(u);
      const rePsi1 = -omega * T + omega * T * Math.pow(r_mod, alpha) * Math.cos(alpha * theta);
      const imPsi1 = u * (r - q - omega) * T + omega * T * Math.pow(r_mod, alpha) * Math.sin(alpha * theta);
      const mag1 = Math.exp(rePsi1);
      const phase1 = imPsi1 - u * k;
      const f1 = (mag1 * Math.sin(phase1)) / u;

      int1 += weight * f1;
      int2 += weight * f2;
    }

    const pi1 = Math.max(0, Math.min(1, 0.5 + (int1 * du) / (3 * Math.PI)));
    const pi2 = Math.max(0, Math.min(1, 0.5 + (int2 * du) / (3 * Math.PI)));
    return { pi1, pi2 };
  }

  public static priceOption(
    spot: number,
    strike: number,
    T: number,
    optionType: 'call' | 'put',
    params: CarrWuParams,
  ): { price: number; pi1: number; pi2: number; omega: number } {
    const { rate: r, dividendYield: q } = params;
    const omega = this.computeConvexityAdjustment(params.alpha, params.sigma);
    const { pi1, pi2 } = this.evaluateProbabilities(spot, strike, T, params);

    const callPrice = spot * Math.exp(-q * T) * pi1 - strike * Math.exp(-r * T) * pi2;
    const safeCall = Math.max(0, Math.max(spot * Math.exp(-q * T) - strike * Math.exp(-r * T), callPrice));

    if (optionType === 'call') {
      return { price: safeCall, pi1, pi2, omega };
    }
    // Put-call parity: P = C - S*e^(-qT) + K*e^(-rT)
    const putPrice = safeCall - spot * Math.exp(-q * T) + strike * Math.exp(-r * T);
    return { price: Math.max(0, putPrice), pi1, pi2, omega };
  }

  public static impliedVolatility(
    price: number,
    spot: number,
    strike: number,
    T: number,
    r: number,
    q: number,
    optionType: 'call' | 'put',
  ): number {
    let low = 0.001;
    let high = 5.0;
    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      const bsPrice = this.blackScholesPrice(spot, strike, T, mid, r, q, optionType);
      if (Math.abs(bsPrice - price) < 1e-6) return mid;
      if (bsPrice > price) high = mid;
      else low = mid;
    }
    return (low + high) / 2;
  }

  public static blackScholesPrice(
    S: number,
    K: number,
    T: number,
    vol: number,
    r: number,
    q: number,
    type: 'call' | 'put',
  ): number {
    const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * Math.sqrt(T));
    const d2 = d1 - vol * Math.sqrt(T);
    const Nd1 = this.normalCdf(d1);
    const Nd2 = this.normalCdf(d2);
    if (type === 'call') {
      return S * Math.exp(-q * T) * Nd1 - K * Math.exp(-r * T) * Nd2;
    }
    return K * Math.exp(-r * T) * (1 - Nd2) - S * Math.exp(-q * T) * (1 - Nd1);
  }

  public static normalCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * y);
  }
}
