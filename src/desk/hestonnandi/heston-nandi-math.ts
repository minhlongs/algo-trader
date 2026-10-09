export interface Complex {
  re: number;
  im: number;
}

export class HestonNandiMath {
  public static cAdd(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
  public static cSub(a: Complex, b: Complex): Complex { return { re: a.re - b.re, im: a.im - b.im }; }
  public static cMul(a: Complex, b: Complex): Complex {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }
  public static cDiv(a: Complex, b: Complex): Complex {
    const denom = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
  }
  public static cLog(a: Complex): Complex {
    return { re: Math.log(Math.sqrt(a.re * a.re + a.im * a.im)), im: Math.atan2(a.im, a.re) };
  }
  public static cExp(a: Complex): Complex {
    const expRe = Math.exp(a.re);
    return { re: expRe * Math.cos(a.im), im: expRe * Math.sin(a.im) };
  }

  // Recursive characteristic function f(phi) = E[S_T^phi | S_t, h_{t+1}]
  public static charFunction(
    phi: Complex,
    s0: number,
    h1: number,
    r: number,
    omega: number,
    alpha: number,
    beta: number,
    gammaStar: number,
    steps: number
  ): Complex {
    let a: Complex = { re: 0.0, im: 0.0 };
    let b: Complex = { re: 0.0, im: 0.0 };

    for (let t = 0; t < steps; t++) {
      // denom = 1 - 2 * alpha * b
      const denom: Complex = { re: 1.0 - 2.0 * alpha * b.re, im: -2.0 * alpha * b.im };

      // term in B: phi * gammaStar + beta * b + 0.5 * (phi - 2*alpha*b*gammaStar)^2 / denom - 0.5 * gammaStar^2
      const twoAlphaBGamma: Complex = {
        re: 2.0 * alpha * b.re * gammaStar,
        im: 2.0 * alpha * b.im * gammaStar,
      };
      const numeratorPart = this.cSub(phi, twoAlphaBGamma);
      const numeratorSq = this.cMul(numeratorPart, numeratorPart);
      const halfNumSq: Complex = { re: 0.5 * numeratorSq.re, im: 0.5 * numeratorSq.im };
      const quotient = this.cDiv(halfNumSq, denom);

      const nextB: Complex = {
        re: phi.re * gammaStar + beta * b.re + quotient.re - 0.5 * gammaStar * gammaStar,
        im: phi.im * gammaStar + beta * b.im + quotient.im,
      };

      // term in A: a + phi * r + b * omega - 0.5 * ln(denom)
      const logDenom = this.cLog(denom);
      const nextA: Complex = {
        re: a.re + phi.re * r + b.re * omega - 0.5 * logDenom.re,
        im: a.im + phi.im * r + b.im * omega - 0.5 * logDenom.im,
      };

      a = nextA;
      b = nextB;
    }

    // f(phi) = S_0^phi * exp(A + B * h1)
    // S_0^phi = exp(phi * ln(S_0))
    const logS0 = Math.log(s0);
    const phiLogS0: Complex = { re: phi.re * logS0, im: phi.im * logS0 };
    const expTerm = this.cAdd(a, { re: b.re * h1, im: b.im * h1 });
    const totalExponent = this.cAdd(phiLogS0, expTerm);

    return this.cExp(totalExponent);
  }

  public static calculateOptionPrice(
    s0: number,
    k: number,
    days: number,
    rDaily: number,
    omega: number,
    alpha: number,
    beta: number,
    gamma: number,
    h1: number,
    lambda: number = 0.0,
    quadSteps: number = 100
  ): { callPrice: number; putPrice: number } {
    const gammaStar = gamma + lambda + 0.5;
    const maxPhi = 50.0;
    const n = quadSteps % 2 === 0 ? quadSteps : quadSteps + 1;
    const dPhi = maxPhi / n;

    let int1 = 0.0;
    let int2 = 0.0;

    for (let j = 1; j <= n; j++) {
      const u = j * dPhi;
      const phi1: Complex = { re: 1.0, im: u }; // for P1: f(i*u + 1)
      const phi2: Complex = { re: 0.0, im: u }; // for P2: f(i*u)

      const f1 = this.charFunction(phi1, s0, h1, rDaily, omega, alpha, beta, gammaStar, days);
      const f2 = this.charFunction(phi2, s0, h1, rDaily, omega, alpha, beta, gammaStar, days);

      // K^(-i*u) = exp(-i*u*ln(K)) = cos(u*ln(K)) - i*sin(u*ln(K))
      const logK = Math.log(k);
      const cosVal = Math.cos(u * logK);
      const sinVal = Math.sin(u * logK);

      // f / (i*u): (re + i*im) / (i*u) = (im - i*re) / u -> Real part is im / u
      // Mult by K^(-i*u): (re_k - i*im_k) * (im/u - i*re/u)
      // Re[(cos - i*sin) * (f / i*u)] = cos*(f.im/u) - sin*(f.re/u)
      const discount = Math.exp(days * rDaily);
      const integrand1 = (cosVal * f1.im - sinVal * f1.re) / (u * s0 * discount);
      const integrand2 = (cosVal * f2.im - sinVal * f2.re) / u;

      let weight = 2.0;
      if (j === n) weight = 1.0;
      else if (j % 2 === 1) weight = 4.0;

      int1 += weight * integrand1;
      int2 += weight * integrand2;
    }

    const p1 = 0.5 + (int1 * dPhi) / (3.0 * Math.PI);
    const p2 = 0.5 + (int2 * dPhi) / (3.0 * Math.PI);

    const df = Math.exp(-days * rDaily);
    const callPrice = Math.max(0.0, s0 * p1 - k * df * p2);
    const putPrice = Math.max(0.0, callPrice - s0 + k * df);

    return { callPrice, putPrice };
  }
}
