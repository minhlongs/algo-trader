export interface Complex {
  re: number;
  im: number;
}

export class CarrMadanMath {
  public static cAdd(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  public static cSub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  public static cMul(a: Complex, b: Complex): Complex {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  public static cDiv(a: Complex, b: Complex): Complex {
    const denom = b.re * b.re + b.im * b.im;
    return {
      re: (a.re * b.re + a.im * b.im) / denom,
      im: (a.im * b.re - a.re * b.im) / denom,
    };
  }

  public static cExp(a: Complex): Complex {
    const r = Math.exp(a.re);
    return {
      re: r * Math.cos(a.im),
      im: r * Math.sin(a.im),
    };
  }

  // Characteristic function of ln(S_T) under Black-Scholes lognormal dynamics
  public static characteristicFunctionBS(
    u: Complex,
    s0: number,
    r: number,
    q: number,
    sigma: number,
    t: number
  ): Complex {
    const lnS0 = Math.log(s0);
    const drift = (r - q - 0.5 * sigma * sigma) * t;
    const halfSigma2T = 0.5 * sigma * sigma * t;

    // term1 = i * u * (lnS0 + drift)
    const coeff = lnS0 + drift;
    const term1: Complex = { re: -u.im * coeff, im: u.re * coeff };

    // term2 = -0.5 * sigma^2 * t * u^2
    // u^2 = (u.re^2 - u.im^2) + i*(2 * u.re * u.im)
    const u2Re = u.re * u.re - u.im * u.im;
    const u2Im = 2.0 * u.re * u.im;
    const term2: Complex = {
      re: -halfSigma2T * u2Re,
      im: -halfSigma2T * u2Im,
    };

    return this.cExp(this.cAdd(term1, term2));
  }

  // Carr-Madan modified call transform integrand psi_T(v)
  // psi_T(v) = exp(-r * T) * phi(v - (alpha + 1) * i) / (alpha^2 + alpha - v^2 + i * (2*alpha + 1) * v)
  public static modifiedCallTransform(
    v: number,
    alpha: number,
    s0: number,
    r: number,
    q: number,
    sigma: number,
    t: number
  ): Complex {
    const uArg: Complex = { re: v, im: -(alpha + 1.0) };
    const phiVal = this.characteristicFunctionBS(uArg, s0, r, q, sigma, t);
    const discount = Math.exp(-r * t);

    const numerator: Complex = {
      re: discount * phiVal.re,
      im: discount * phiVal.im,
    };

    const denom: Complex = {
      re: alpha * alpha + alpha - v * v,
      im: (2.0 * alpha + 1.0) * v,
    };

    return this.cDiv(numerator, denom);
  }

  // Simpson quadrature integration for Carr-Madan inversion
  // C(K) = exp(-alpha * k) / pi * int_0^B Re( exp(-i * v * k) * psi_T(v) ) dv
  public static calculateCallPrice(
    s0: number,
    k: number,
    r: number,
    q: number,
    sigma: number,
    t: number,
    alpha: number = 1.5,
    bUpper: number = 100.0,
    steps: number = 1024
  ): number {
    const logK = Math.log(k);
    const n = steps % 2 === 0 ? steps : steps + 1;
    const dv = bUpper / n;

    let sum = 0.0;
    for (let j = 0; j <= n; j++) {
      const v = j * dv;
      const psi = this.modifiedCallTransform(v, alpha, s0, r, q, sigma, t);

      // exp(-i * v * logK) = cos(v * logK) - i * sin(v * logK)
      const cosVal = Math.cos(v * logK);
      const sinVal = Math.sin(v * logK);
      const reIntegrand = cosVal * psi.re + sinVal * psi.im;

      let weight = 2.0;
      if (j === 0 || j === n) weight = 1.0;
      else if (j % 2 === 1) weight = 4.0;

      sum += weight * reIntegrand;
    }

    const integral = (sum * dv) / 3.0;
    const call = (Math.exp(-alpha * logK) / Math.PI) * integral;
    return Math.max(0.0, call);
  }
}
