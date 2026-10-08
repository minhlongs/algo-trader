export interface Complex {
  readonly re: number;
  readonly im: number;
}

export class ComplexMath {
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

  public static exp(a: Complex): Complex {
    const r = Math.exp(a.re);
    return {
      re: r * Math.cos(a.im),
      im: r * Math.sin(a.im),
    };
  }

  public static log(a: Complex): Complex {
    const r = Math.hypot(a.re, a.im);
    const theta = Math.atan2(a.im, a.re);
    return {
      re: Math.log(r),
      im: theta,
    };
  }

  public static sqrt(a: Complex): Complex {
    const r = Math.hypot(a.re, a.im);
    const gamma = Math.sqrt(Math.max(0, (r + a.re) / 2.0));
    const delta = Math.sign(a.im === 0 ? 1 : a.im) * Math.sqrt(Math.max(0, (r - a.re) / 2.0));
    return { re: gamma, im: delta };
  }
}
