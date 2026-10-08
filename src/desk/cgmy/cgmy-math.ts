import { ComplexNumber } from './cgmy-types';

export class CgmyMath {
  public static gamma(z: number): number {
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1.0 - z));
    }
    const zMinus1 = z - 1.0;
    const p = [
      676.5209384912348, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109583615812,
      9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) {
      x += p[i] / (zMinus1 + i + 1);
    }
    const t = zMinus1 + 7.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, zMinus1 + 0.5) * Math.exp(-t) * x;
  }

  public static complexPow(z: ComplexNumber, power: number): ComplexNumber {
    const r = Math.hypot(z.re, z.im);
    const theta = Math.atan2(z.im, z.re);
    const rPow = Math.pow(r, power);
    return {
      re: rPow * Math.cos(power * theta),
      im: rPow * Math.sin(power * theta),
    };
  }

  public static complexExp(z: ComplexNumber): ComplexNumber {
    const expRe = Math.exp(z.re);
    return {
      re: expRe * Math.cos(z.im),
      im: expRe * Math.sin(z.im),
    };
  }

  public static complexMul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    };
  }

  public static readonly GAUSS_LAGUERRE_NODES: number[] = [
    0.0933078, 0.4926917, 1.2155954, 2.2699495, 3.6676227,
    5.4253366, 7.5659162, 10.1202286, 13.1302825, 16.6544077,
    20.7764789, 25.6238867, 31.4075192, 38.5306833, 48.0260856,
  ];

  public static readonly GAUSS_LAGUERRE_WEIGHTS: number[] = [
    0.2372338, 0.2818536, 0.2281804, 0.1388724, 0.0674681,
    0.0261149, 0.0079915, 0.0018780, 0.0003300, 0.0000427,
    0.0000038, 2.19e-7, 7.37e-9, 1.09e-10, 3.23e-13,
  ];
}
