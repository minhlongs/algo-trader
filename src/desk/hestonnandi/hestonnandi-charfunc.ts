/**
 * Complex Characteristic Function recursion for Heston-Nandi (2000) GARCH.
 * Evaluates A(tau, phi) and B(tau, phi) backwards along the maturity lattice.
 * Strictly < 150 LOC, zero `:any` types.
 */

import { ComplexNumber, HestonNandiParameters } from './hestonnandi-types';

export class HestonNandiCharFunc {
  public static add(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { real: a.real + b.real, imag: a.imag + b.imag };
  }

  public static sub(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { real: a.real - b.real, imag: a.imag - b.imag };
  }

  public static mul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return {
      real: a.real * b.real - a.imag * b.imag,
      imag: a.real * b.imag + a.imag * b.real,
    };
  }

  public static div(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    const denom = b.real * b.real + b.imag * b.imag;
    if (denom === 0) return { real: 0, imag: 0 };
    return {
      real: (a.real * b.real + a.imag * b.imag) / denom,
      imag: (a.imag * b.real - a.real * b.imag) / denom,
    };
  }

  public static complexLog(z: ComplexNumber): ComplexNumber {
    const r = Math.sqrt(z.real * z.real + z.imag * z.imag);
    const theta = Math.atan2(z.imag, z.real);
    return { real: Math.log(Math.max(1e-15, r)), imag: theta };
  }

  /**
   * Recursively computes A(tau) and B(tau) for characteristic parameter phi.
   * Under risk-neutral measure Q, gamma* = gamma + lambda + 0.5.
   */
  public static computeCoefficients(
    phi: ComplexNumber,
    tau: number,
    params: HestonNandiParameters
  ): { A: ComplexNumber; B: ComplexNumber } {
    const { omega, alpha, beta, gamma, lambda, riskFreeRate } = params;
    const gammaStar = gamma + lambda + 0.5;

    let A: ComplexNumber = { real: 0, imag: 0 };
    let B: ComplexNumber = { real: 0, imag: 0 };

    for (let t = 1; t <= tau; t++) {
      // denom = 1 - 2 * alpha * B_{prev}
      const denom: ComplexNumber = {
        real: 1 - 2 * alpha * B.real,
        imag: -2 * alpha * B.imag,
      };

      // termLog = complexLog(denom)
      const termLog = this.complexLog(denom);

      // A_next = A + phi * r + B * omega - 0.5 * ln(1 - 2 * alpha * B)
      const A_next: ComplexNumber = {
        real: A.real + phi.real * riskFreeRate + B.real * omega - 0.5 * termLog.real,
        imag: A.imag + phi.imag * riskFreeRate + B.imag * omega - 0.5 * termLog.imag,
      };

      // num = (phi - gamma*)^2
      const phiMinusGamma: ComplexNumber = {
        real: phi.real - gammaStar,
        imag: phi.imag,
      };
      const num = this.mul(phiMinusGamma, phiMinusGamma);
      const frac = this.div(num, denom);

      // B_next = phi * (gamma* - 0.5) - 0.5 * (gamma*)^2 + beta * B + 0.5 * frac
      // Note: In HN 2000 eq (13), B_t = phi*(gamma* + lambda*) - 0.5*(gamma*)^2 + beta*B + 0.5*num/denom with lambda* = -0.5
      const B_next: ComplexNumber = {
        real:
          phi.real * (gammaStar - 0.5) -
          0.5 * gammaStar * gammaStar +
          beta * B.real +
          0.5 * frac.real,
        imag: phi.imag * (gammaStar - 0.5) + beta * B.imag + 0.5 * frac.imag,
      };

      A = A_next;
      B = B_next;
    }

    return { A, B };
  }

  /**
   * Evaluates conditional characteristic function f(phi) = S^phi * exp(A + B * h)
   */
  public static evaluateCharFunc(
    phi: ComplexNumber,
    spotPrice: number,
    hNext: number,
    tau: number,
    params: HestonNandiParameters
  ): ComplexNumber {
    const { A, B } = this.computeCoefficients(phi, tau, params);

    // S^phi = exp(phi * ln(S))
    const lnS = Math.log(spotPrice);
    const exponentReal = phi.real * lnS + A.real + B.real * hNext;
    const exponentImag = phi.imag * lnS + A.imag + B.imag * hNext;

    // exp(x + i y) = exp(x) * (cos(y) + i sin(y))
    const expReal = Math.exp(Math.min(700, Math.max(-700, exponentReal)));
    return {
      real: expReal * Math.cos(exponentImag),
      imag: expReal * Math.sin(exponentImag),
    };
  }
}
