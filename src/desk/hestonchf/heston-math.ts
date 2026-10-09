import { HestonParams } from './heston-types.js';

interface Complex {
  re: number;
  im: number;
}

export class HestonMath {
  public static cAdd(a: Complex, b: Complex): Complex {
    return { re: a.re + b.re, im: a.im + b.im };
  }

  public static cSub(a: Complex, b: Complex): Complex {
    return { re: a.re - b.re, im: a.im - b.im };
  }

  public static cMul(a: Complex, b: Complex): Complex {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
  }

  public static cDiv(a: Complex, b: Complex): Complex {
    const denom = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
  }

  public static cExp(a: Complex): Complex {
    const r = Math.exp(a.re);
    return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) };
  }

  public static cSqrt(a: Complex): Complex {
    const r = Math.hypot(a.re, a.im);
    const theta = Math.atan2(a.im, a.re);
    const sqrtR = Math.sqrt(r);
    return { re: sqrtR * Math.cos(theta / 2), im: sqrtR * Math.sin(theta / 2) };
  }

  public static cLog(a: Complex): Complex {
    return { re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) };
  }

  /**
   * Albrecher et al. (2007) stable Little-Trap characteristic function
   */
  public static characteristicFunction(phi: number, params: HestonParams, type: 1 | 2): Complex {
    const { spot, timeToExpiry: T, riskFreeRate: r, dividendYield: q, v0, kappa, theta, sigmaV, rho } = params;
    const u = type === 1 ? 0.5 : -0.5;
    const b = type === 1 ? kappa - rho * sigmaV : kappa;
    const x = Math.log(spot);

    const dSqr: Complex = {
      re: (b * b - (rho * sigmaV * phi) * (rho * sigmaV * phi) - sigmaV * sigmaV * (phi * phi)) + (type === 1 ? 0 : 0),
      im: -2 * b * rho * sigmaV * phi + (type === 1 ? sigmaV * sigmaV * phi : -sigmaV * sigmaV * phi),
    };
    // Alternative exact formulation:
    // d = sqrt((rho*sigmaV*phi*i - b)^2 - sigmaV^2 * (2*u*phi*i - phi^2))
    const alpha: Complex = { re: -b, im: rho * sigmaV * phi };
    const term1 = this.cMul(alpha, alpha);
    const term2: Complex = { re: sigmaV * sigmaV * (phi * phi), im: -2 * u * sigmaV * sigmaV * phi };
    const d = this.cSqrt(this.cAdd(term1, term2));

    const gNum = this.cSub(alpha, d);
    const gDenom = this.cAdd(alpha, d);
    const g = this.cDiv(gNum, gDenom);

    const expDT = this.cExp({ re: -d.re * T, im: -d.im * T });
    const oneMinusGExp = this.cSub({ re: 1, im: 0 }, this.cMul(g, expDT));
    const oneMinusG = this.cSub({ re: 1, im: 0 }, g);

    const C_term = this.cDiv(
      this.cMul({ re: (kappa * theta) / (sigmaV * sigmaV), im: 0 },
        this.cSub(
          this.cMul(gNum, { re: T, im: 0 }),
          this.cMul({ re: 2, im: 0 }, this.cLog(this.cDiv(oneMinusGExp, oneMinusG)))
        )
      ),
      { re: 1, im: 0 }
    );

    const D_term = this.cMul(
      this.cDiv(gNum, { re: sigmaV * sigmaV, im: 0 }),
      this.cDiv(this.cSub({ re: 1, im: 0 }, expDT), oneMinusGExp)
    );

    // Phi_term: exp(C + D*v0 + i*phi*(x + (r - q)*T))
    const totalExp = this.cAdd(
      this.cAdd(C_term, { re: D_term.re * v0, im: D_term.im * v0 }),
      { re: 0, im: phi * (x + (r - q) * T) }
    );

    return this.cExp(totalExp);
  }

  public static calculateProbability(params: HestonParams, type: 1 | 2, upperLimit = 100, intervals = 1000): number {
    const { strike } = params;
    const lnK = Math.log(strike);
    const h = upperLimit / intervals;

    const integrand = (phi: number): number => {
      if (phi === 0) return 0;
      const cf = this.characteristicFunction(phi, params, type);
      // Re( e^{-i phi ln(K)} * cf / (i * phi) )
      const expTerm: Complex = { re: Math.cos(-phi * lnK), im: Math.sin(-phi * lnK) };
      const num = this.cMul(expTerm, cf);
      const denom: Complex = { re: 0, im: phi };
      const quotient = this.cDiv(num, denom);
      return quotient.re;
    };

    let sum = integrand(1e-6) + integrand(upperLimit);
    for (let i = 1; i < intervals; i++) {
      const phi = i * h;
      sum += integrand(phi) * (i % 2 === 0 ? 2 : 4);
    }
    const integral = (sum * h) / 3;
    return 0.5 + (1 / Math.PI) * integral;
  }
}
