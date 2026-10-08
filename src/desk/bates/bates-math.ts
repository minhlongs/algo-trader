import { ComplexNumber } from './bates-types';

export class BatesMath {
  public static add(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  public static sub(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  public static mulScalar(a: ComplexNumber, s: number): ComplexNumber {
    return { re: a.re * s, im: a.im * s };
  }

  public static mul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  public static div(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    const denom = b.re * b.re + b.im * b.im;
    if (denom === 0) return { re: 0, im: 0 };
    return {
      re: (a.re * b.re + a.im * b.im) / denom,
      im: (a.im * b.re - a.re * b.im) / denom,
    };
  }

  public static exp(a: ComplexNumber): ComplexNumber {
    const expRe = Math.exp(a.re);
    return {
      re: expRe * Math.cos(a.im),
      im: expRe * Math.sin(a.im),
    };
  }

  public static log(a: ComplexNumber): ComplexNumber {
    return {
      re: Math.log(Math.sqrt(a.re * a.re + a.im * a.im)),
      im: Math.atan2(a.im, a.re),
    };
  }

  public static sqrt(a: ComplexNumber): ComplexNumber {
    const r = Math.sqrt(a.re * a.re + a.im * a.im);
    const theta = Math.atan2(a.im, a.re) / 2.0;
    const sqrtR = Math.sqrt(r);
    return {
      re: sqrtR * Math.cos(theta),
      im: sqrtR * Math.sin(theta),
    };
  }
}
