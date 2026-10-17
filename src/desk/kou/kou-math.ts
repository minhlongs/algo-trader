/**
 * Kou (2002) Double Exponential Jump-Diffusion Mathematical Suite
 *
 * Implements exact characteristic function evaluation, Gil-Pelaez inversion,
 * and higher-order moments for the Kou (2002) option pricing model.
 *
 * @module desk/kou/kou-math
 */

import type { KouConfig, KouMoments } from './kou-types';

export interface Complex {
  re: number;
  im: number;
}

export class KouMath {
  /**
   * Expected relative jump size: zeta = E[e^Y - 1]
   */
  public static computeMeanRelativeJump(p: number, eta1: number, eta2: number): number {
    const q = 1.0 - p;
    return (p * eta1) / (eta1 - 1.0) + (q * eta2) / (eta2 + 1.0) - 1.0;
  }

  /**
   * Characteristic function of jump size Y: E[e^{i u Y}]
   */
  public static jumpCharacteristic(u: Complex, p: number, eta1: number, eta2: number): Complex {
    const q = 1.0 - p;

    // Term 1: p * eta1 / (eta1 - i*u)
    const d1_re = eta1 + u.im;
    const d1_im = -u.re;
    const denom1 = d1_re * d1_re + d1_im * d1_im;
    const t1_re = (p * eta1 * d1_re) / denom1;
    const t1_im = (-p * eta1 * d1_im) / denom1;

    // Term 2: q * eta2 / (eta2 + i*u)
    const d2_re = eta2 - u.im;
    const d2_im = u.re;
    const denom2 = d2_re * d2_re + d2_im * d2_im;
    const t2_re = (q * eta2 * d2_re) / denom2;
    const t2_im = (-q * eta2 * d2_im) / denom2;

    return { re: t1_re + t2_re, im: t1_im + t2_im };
  }

  /**
   * Characteristic function of log-price ln(S_T) under Q
   */
  public static characteristicFunction(u: Complex, cfg: KouConfig): Complex {
    const { spot, maturity: T, riskFreeRate: r, volatility: sigma, jumpIntensity: lambda, pUp: p, eta1, eta2 } = cfg;
    const qDiv = cfg.dividendYield ?? 0;
    const zeta = this.computeMeanRelativeJump(p, eta1, eta2);
    const mu = Math.log(spot) + (r - qDiv - 0.5 * sigma * sigma - lambda * zeta) * T;

    // Jump component: lambda * T * (psi(u) - 1)
    const psi = this.jumpCharacteristic(u, p, eta1, eta2);
    const jump_re = lambda * T * (psi.re - 1.0);
    const jump_im = lambda * T * psi.im;

    // Diffusion component: i * u * mu - 0.5 * sigma^2 * u^2 * T
    // u^2 = (u.re + i u.im)^2 = (u.re^2 - u.im^2) + 2 i u.re u.im
    const u2_re = u.re * u.re - u.im * u.im;
    const u2_im = 2 * u.re * u.im;

    const exponent_re = -u.im * mu - 0.5 * sigma * sigma * T * u2_re + jump_re;
    const exponent_im = u.re * mu - 0.5 * sigma * sigma * T * u2_im + jump_im;

    const mag = Math.exp(exponent_re);
    return { re: mag * Math.cos(exponent_im), im: mag * Math.sin(exponent_im) };
  }

  /**
   * Prices European call or put using Fourier inversion
   */
  public static priceOption(cfg: KouConfig, isCall: boolean = true): number {
    const { spot, strike, maturity: T, riskFreeRate: r } = cfg;
    const qDiv = cfg.dividendYield ?? 0;

    if (T <= 0) {
      return isCall ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    }

    const lnK = Math.log(strike);
    const dfRiskFree = Math.exp(-r * T);
    const dfDiv = Math.exp(-qDiv * T);

    // Midpoint rule integration over [0, U_max] avoiding u=0 singularity
    const uMax = 200.0;
    const nSteps = 4000;
    const h = uMax / nSteps;

    let p1Sum = 0;
    let p2Sum = 0;

    for (let i = 0; i < nSteps; i++) {
      const uVal = (i + 0.5) * h;

      // P2 integrand: Re[ exp(-i u lnK) * phi(u) / (i u) ]
      const phi2 = this.characteristicFunction({ re: uVal, im: 0 }, cfg);
      const cos_uK = Math.cos(uVal * lnK);
      const sin_uK = Math.sin(uVal * lnK);
      const prod2_im = phi2.im * cos_uK - phi2.re * sin_uK;
      p2Sum += prod2_im / uVal;

      // P1 integrand: Re[ exp(-i u lnK) * phi(u - i) / (i u * S_0 * exp((r - q)T)) ]
      const phi1 = this.characteristicFunction({ re: uVal, im: -1 }, cfg);
      const prod1_im = phi1.im * cos_uK - phi1.re * sin_uK;
      const phi_minus_i = spot * Math.exp((r - qDiv) * T);
      p1Sum += prod1_im / (uVal * phi_minus_i);
    }

    const p1 = 0.5 + (p1Sum * h) / Math.PI;
    const p2 = 0.5 + (p2Sum * h) / Math.PI;

    const callPrice = spot * dfDiv * p1 - strike * dfRiskFree * p2;
    if (isCall) {
      return Math.max(0, callPrice);
    }
    // Put-Call Parity: P = C - S*e^(-qT) + K*e^(-rT)
    const putPrice = callPrice - spot * dfDiv + strike * dfRiskFree;
    return Math.max(0, putPrice);
  }

  /**
   * Computes analytical moments of log returns ln(S_T / S_0)
   */
  public static computeMoments(cfg: KouConfig): KouMoments {
    const { maturity: T, riskFreeRate: r, volatility: sigma, jumpIntensity: lambda, pUp: p, eta1, eta2 } = cfg;
    const qDiv = cfg.dividendYield ?? 0;
    const q = 1.0 - p;
    const zeta = this.computeMeanRelativeJump(p, eta1, eta2);

    const EY1 = p / eta1 - q / eta2;
    const EY2 = 2.0 * (p / (eta1 * eta1) + q / (eta2 * eta2));
    const EY3 = 6.0 * (p / (eta1 * eta1 * eta1) - q / (eta2 * eta2 * eta2));
    const EY4 = 24.0 * (p / Math.pow(eta1, 4) + q / Math.pow(eta2, 4));

    const drift = (r - qDiv - 0.5 * sigma * sigma - lambda * zeta + lambda * EY1) * T;
    const variance = (sigma * sigma + lambda * EY2) * T;
    const stdDev = Math.sqrt(variance);

    const skewness = (lambda * EY3 * T) / Math.pow(stdDev, 3);
    const excessKurtosis = (lambda * EY4 * T) / Math.pow(variance, 2);

    return {
      meanLogReturn: drift,
      variance,
      skewness,
      excessKurtosis,
      jumpMean: EY1,
      jumpVariance: EY2 - EY1 * EY1,
    };
  }
}
