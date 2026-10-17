import { Complex, VarianceGammaMomentsAnalytical } from './variance-gamma-moments-types';

export class VarianceGammaMomentsMath {
  public static add(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  public static sub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  public static mul(a: Complex, b: Complex): Complex {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  public static mulScalar(a: Complex, s: number): Complex {
    return { re: a.re * s, im: a.im * s };
  }

  public static div(a: Complex, b: Complex): Complex {
    const denom = b.re * b.re + b.im * b.im;
    if (denom < 1e-18) throw new Error('Complex division by zero');
    return {
      re: (a.re * b.re + a.im * b.im) / denom,
      im: (a.im * b.re - a.re * b.im) / denom,
    };
  }

  public static log(a: Complex): Complex {
    const r = Math.hypot(a.re, a.im);
    const theta = Math.atan2(a.im, a.re);
    return { re: Math.log(r), im: theta };
  }

  public static exp(a: Complex): Complex {
    const r = Math.exp(a.re);
    return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) };
  }

  public static powReal(a: Complex, p: number): Complex {
    const logA = this.log(a);
    return this.exp(this.mulScalar(logA, p));
  }

  public static calculateOmega(sigma: number, nu: number, theta: number): number {
    const arg = 1.0 - theta * nu - 0.5 * sigma * sigma * nu;
    if (arg <= 0) {
      throw new Error(
        'Martingale condition violated: 1 - theta*nu - 0.5*sigma^2*nu must be strictly positive'
      );
    }
    return (1.0 / nu) * Math.log(arg);
  }

  public static calculateAnalyticalMoments(
    sigma: number,
    nu: number,
    theta: number,
    t: number
  ): VarianceGammaMomentsAnalytical {
    const variance = (sigma * sigma + nu * theta * theta) * t;
    const stdDev = Math.sqrt(Math.max(1e-14, variance));
    const mean = theta * t;

    // Skewness: gamma_1 = (2*theta^3*nu^2 + 3*sigma^2*theta*nu)*t / (variance)^(3/2)
    const numSkew = (2.0 * Math.pow(theta, 3) * Math.pow(nu, 2) + 3.0 * sigma * sigma * theta * nu) * t;
    const skewness = numSkew / Math.pow(variance, 1.5);

    // Excess Kurtosis: gamma_2 = 3 * nu * (1 + 2*(theta*nu)^2 / (sigma^2 + nu*theta^2) ... ) / t
    // Or equivalently (E[X^4] - 3*Var^2)/Var^2 = 3*nu*(sigma^4 + 2*sigma^2*nu*theta^2 + 3*nu^2*theta^4) / (t * (sigma^2 + nu*theta^2)^2)
    // For pure VG X_t: excess kurtosis = (3 * nu / t) * (1 + (2*theta^2*nu*(2*sigma^2 + theta^2*nu)) / (sigma^2 + theta^2*nu)^2)
    // If theta = 0, simplifies to 3*nu / t.
    // Exact 4th cumulant kappa_4 = (3 * nu * (sigma^4 + 2*sigma^2*nu*theta^2 + 2*nu^2*theta^4(?)))
    // Let's use the exact Madan-Carr-Chang formula:
    // kappa_2 = (sigma^2 + nu*theta^2)*t
    // kappa_3 = (3*sigma^2*theta*nu + 2*theta^3*nu^2)*t
    // kappa_4 = 3 * nu * (sigma^4 + 2*sigma^2*nu*theta^2 + 2*theta^4*nu^2)*t  -- note: when theta=0, 3*nu*sigma^4*t
    const kappa4 = 3.0 * nu * (Math.pow(sigma, 4) + 2.0 * sigma * sigma * nu * theta * theta + 2.0 * Math.pow(theta, 4) * Math.pow(nu, 2)) * t;
    const excessKurtosis = kappa4 / (variance * variance);

    return {
      mean,
      variance,
      stdDev,
      skewness,
      excessKurtosis,
    };
  }

  public static characteristicFunction(
    z: Complex,
    forwardLog: number,
    t: number,
    sigma: number,
    nu: number,
    theta: number
  ): Complex {
    // phi(z) = exp(i * z * forwardLog) * [ 1 - i * theta * nu * z + 0.5 * sigma^2 * nu * z^2 ]^(-t / nu)
    const iZ: Complex = { re: -z.im, im: z.re };
    const termTheta = this.mulScalar(iZ, -theta * nu);
    const zSq = this.mul(z, z);
    const termSigma = this.mulScalar(zSq, 0.5 * sigma * sigma * nu);

    const baseBracket = this.add({ re: 1.0, im: 0.0 }, this.add(termTheta, termSigma));
    const powerPart = this.powReal(baseBracket, -t / nu);

    const driftPart = this.exp({ re: -z.im * forwardLog, im: z.re * forwardLog });
    return this.mul(driftPart, powerPart);
  }

  public static adaptiveQuadrature(
    f: (x: number) => number,
    a: number,
    b: number,
    tol: number = 1e-8,
    maxDepth: number = 18
  ): number {
    const simpson = (x0: number, x2: number): { val: number; mid: number } => {
      const x1 = 0.5 * (x0 + x2);
      return { val: ((x2 - x0) / 6.0) * (f(x0) + 4.0 * f(x1) + f(x2)), mid: x1 };
    };

    const recursiveAdaptive = (
      x0: number,
      x2: number,
      tolStep: number,
      whole: number,
      depth: number
    ): number => {
      const x1 = 0.5 * (x0 + x2);
      const left = simpson(x0, x1);
      const right = simpson(x1, x2);
      const delta = left.val + right.val - whole;

      if (depth <= 0 || Math.abs(delta) <= 15.0 * tolStep) {
        return left.val + right.val + delta / 15.0;
      }

      return (
        recursiveAdaptive(x0, x1, 0.5 * tolStep, left.val, depth - 1) +
        recursiveAdaptive(x1, x2, 0.5 * tolStep, right.val, depth - 1)
      );
    };

    const initial = simpson(a, b);
    return recursiveAdaptive(a, b, tol, initial.val, maxDepth);
  }
}
