/**
 * Wave 205: Hansen & Lunde (2006) Realized Kernel Mathematics.
 * Weight functions and autocovariances for noise-robust integrated variance.
 * Strictly < 180 LOC, zero :any.
 */

import { KernelType } from './realized-kernel-types';

export class RealizedKernelMath {
  /**
   * Evaluate kernel weight k(x) for x = h / H in [0, 1].
   */
  public static evaluateKernelWeight(x: number, kernelType: KernelType): number {
    const xAbs = Math.abs(x);
    if (xAbs > 1.0) return 0.0;

    switch (kernelType) {
      case 'PARZEN':
        if (xAbs <= 0.5) {
          return 1.0 - 6.0 * Math.pow(xAbs, 2) + 6.0 * Math.pow(xAbs, 3);
        } else {
          return 2.0 * Math.pow(1.0 - xAbs, 3);
        }

      case 'TUKEY_HANNING':
        return 0.5 * (1.0 - Math.cos(Math.PI * (1.0 - xAbs)));

      case 'BARTLETT':
        return 1.0 - xAbs;

      case 'CUBIC':
        return 1.0 - 3.0 * Math.pow(xAbs, 2) + 2.0 * Math.pow(xAbs, 3);

      default:
        return 1.0 - xAbs;
    }
  }

  /**
   * Calculate sample autocovariance gamma_h = sum_{j=h+1}^n (r_j * r_{j-h}).
   */
  public static calculateAutocovariance(returns: number[], lag: number): number {
    const n = returns.length;
    if (lag < 0 || lag >= n) return 0.0;

    let sum = 0.0;
    for (let j = lag; j < n; j++) {
      sum += returns[j] * returns[j - lag];
    }
    return sum;
  }

  /**
   * Estimate microstructure noise variance omega^2 = gamma_0 / (2n) or from ultra-high frequency 1st autocovariance.
   */
  public static estimateNoiseVariance(returns: number[]): number {
    const n = returns.length;
    if (n < 4) return 0.0;

    const gamma1 = this.calculateAutocovariance(returns, 1);
    // Microstructure noise induces negative 1st lag autocovariance: gamma_1 ≈ -omega^2
    const omega2FromLag1 = Math.max(0.0, -gamma1);
    const rv = this.calculateAutocovariance(returns, 0);
    const omega2FromRv = rv / (2.0 * n);

    return omega2FromLag1 > 0 ? omega2FromLag1 : omega2FromRv;
  }

  /**
   * Hansen & Lunde (2006) / Barndorff-Nielsen et al. (2008) optimal bandwidth H*.
   * H* = c* * xi^(4/5) * n^(3/5)
   */
  public static calculateOptimalBandwidth(
    n: number,
    noiseVarianceOmega2: number,
    integratedVarianceProxy: number,
    kernelType: KernelType
  ): number {
    if (n <= 10) return 1;

    const iv = Math.max(1e-12, integratedVarianceProxy);
    const xi2 = Math.max(1e-8, noiseVarianceOmega2 / Math.sqrt(iv));
    const xi = Math.sqrt(xi2);

    let cStar = 3.513; // Constant for Parzen kernel
    if (kernelType === 'TUKEY_HANNING') cStar = 3.7;
    else if (kernelType === 'CUBIC') cStar = 3.4;
    else if (kernelType === 'BARTLETT') cStar = 2.8;

    const hOpt = Math.round(cStar * Math.pow(xi, 0.8) * Math.pow(n, 0.6));
    return Math.max(1, Math.min(Math.floor(n / 4), hOpt));
  }
}
