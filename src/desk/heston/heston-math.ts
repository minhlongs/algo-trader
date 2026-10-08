import { ComplexNumber } from './heston-types';

export class HestonMath {
  public static add(c1: ComplexNumber, c2: ComplexNumber): ComplexNumber {
    return { re: c1.re + c2.re, im: c1.im + c2.im };
  }

  public static sub(c1: ComplexNumber, c2: ComplexNumber): ComplexNumber {
    return { re: c1.re - c2.re, im: c1.im - c2.im };
  }

  public static mulScalar(c: ComplexNumber, s: number): ComplexNumber {
    return { re: c.re * s, im: c.im * s };
  }

  public static mul(c1: ComplexNumber, c2: ComplexNumber): ComplexNumber {
    return {
      re: c1.re * c2.re - c1.im * c2.im,
      im: c1.re * c2.im + c1.im * c2.re
    };
  }
  
  public static div(c1: ComplexNumber, c2: ComplexNumber): ComplexNumber {
    const denom = c2.re * c2.re + c2.im * c2.im;
    if (denom === 0) return { re: 0, im: 0 };
    return {
      re: (c1.re * c2.re + c1.im * c2.im) / denom,
      im: (c1.im * c2.re - c1.re * c2.im) / denom
    };
  }

  public static exp(c: ComplexNumber): ComplexNumber {
    const expRe = Math.exp(c.re);
    return {
      re: expRe * Math.cos(c.im),
      im: expRe * Math.sin(c.im)
    };
  }

  public static log(c: ComplexNumber): ComplexNumber {
    return {
      re: Math.log(Math.sqrt(c.re * c.re + c.im * c.im)),
      im: Math.atan2(c.im, c.re)
    };
  }

  public static sqrt(c: ComplexNumber): ComplexNumber {
    const r = Math.sqrt(c.re * c.re + c.im * c.im);
    const theta = Math.atan2(c.im, c.re) / 2.0;
    const sqrtR = Math.sqrt(r);
    return {
      re: sqrtR * Math.cos(theta),
      im: sqrtR * Math.sin(theta)
    };
  }
}
