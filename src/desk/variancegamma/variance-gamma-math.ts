import { ComplexNumber } from './variance-gamma-types';

export class VarianceGammaMath {
  public static add(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  public static sub(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  public static mul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  public static mulScalar(a: ComplexNumber, s: number): ComplexNumber {
    return { re: a.re * s, im: a.im * s };
  }

  public static div(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    const denom = b.re * b.re + b.im * b.im;
    if (denom < 1e-16) throw new Error('Complex division by zero');
    return {
      re: (a.re * b.re + a.im * b.im) / denom,
      im: (a.im * b.re - a.re * b.im) / denom,
    };
  }

  public static log(a: ComplexNumber): ComplexNumber {
    const r = Math.hypot(a.re, a.im);
    const theta = Math.atan2(a.im, a.re);
    return { re: Math.log(r), im: theta };
  }

  public static exp(a: ComplexNumber): ComplexNumber {
    const r = Math.exp(a.re);
    return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) };
  }

  public static powReal(a: ComplexNumber, p: number): ComplexNumber {
    // a^p = exp(p * log(a))
    const logA = this.log(a);
    return this.exp(this.mulScalar(logA, p));
  }
}
