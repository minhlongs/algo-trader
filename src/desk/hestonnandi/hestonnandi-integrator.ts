/**
 * Quadrature Integration and Option Pricing for Heston & Nandi (2000).
 * Calculates risk-neutral probabilities P1 and P2 using inverted characteristic functions.
 * Strictly < 150 LOC, zero `:any` types.
 */

import { ComplexNumber, HestonNandiParameters } from './hestonnandi-types';
import { HestonNandiCharFunc } from './hestonnandi-charfunc';

export class HestonNandiIntegrator {
  private static readonly GAUSS_LEGENDRE_NODES = 64;
  private static readonly UPPER_BOUND = 100.0;

  /**
   * Computes P1 or P2 using Fourier inversion of characteristic function.
   * P1 corresponds to phi = i * u + 1 normalized by S_t * exp(r * tau).
   * P2 corresponds to phi = i * u.
   */
  public static computeProbability(
    index: 1 | 2,
    spotPrice: number,
    strikePrice: number,
    hNext: number,
    tau: number,
    params: HestonNandiParameters
  ): number {
    const lnK = Math.log(strikePrice);
    const rTau = params.riskFreeRate * tau;
    const discountFactor = index === 1 ? spotPrice * Math.exp(rTau) : 1.0;

    // Numerical integration using trapezoidal / Simpson rule on [1e-4, UPPER_BOUND]
    const steps = 120;
    const du = this.UPPER_BOUND / steps;
    let integral = 0;

    for (let i = 1; i < steps; i++) {
      const u = i * du;
      const phi: ComplexNumber =
        index === 1 ? { real: 1.0, imag: u } : { real: 0.0, imag: u };

      const fVal = HestonNandiCharFunc.evaluateCharFunc(
        phi,
        spotPrice,
        hNext,
        tau,
        params
      );

      // Integrand: Re( exp(-i * u * ln(K)) * f(phi) / (i * u) ) / discountFactor
      // exp(-i * u * ln(K)) = cos(u * lnK) - i * sin(u * lnK)
      const cosVal = Math.cos(u * lnK);
      const sinVal = Math.sin(u * lnK);
      const prodReal = fVal.real * cosVal + fVal.imag * sinVal;
      const prodImag = fVal.imag * cosVal - fVal.real * sinVal;

      // Division by (i * u): (prodReal + i * prodImag) / (i * u) = prodImag / u - i * (prodReal / u)
      // Real part is prodImag / u
      const integrand = prodImag / (u * discountFactor);
      integral += integrand * du;
    }

    const prob = 0.5 + (1.0 / Math.PI) * integral;
    return Math.max(0.0, Math.min(1.0, prob));
  }
}
