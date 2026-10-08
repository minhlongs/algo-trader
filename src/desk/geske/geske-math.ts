export class GeskeMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    // Cody (1969) / Hart high-precision approximation
    if (x === 0.0) return 0.5;
    if (x < -10.0) return 0.0;
    if (x > 10.0) return 1.0;

    const z = Math.abs(x);
    const t = 1.0 / (1.0 + 0.2316419 * z);
    const poly =
      t * (0.319381530 +
        t * (-0.356563782 +
          t * (1.781477937 +
            t * (-1.821255978 +
              t * 1.330274429))));
    const cdf = 1.0 - this.normalPdf(z) * poly;
    return x >= 0.0 ? cdf : 1.0 - cdf;
  }

  /**
   * High-precision Bivariate Normal Cumulative Distribution Function M(a, b; rho).
   * Evaluates via the smooth substitution theta = arcsin(r):
   * M(a, b; rho) = N(a)*N(b) + (1 / 2pi) * integral_0^arcsin(rho) exp(-(a^2 - 2sin(theta)ab + b^2)/(2cos^2(theta))) dtheta
   */
  public static bivariateNormalCdf(a: number, b: number, rho: number): number {
    if (rho === 0.0) {
      return this.normalCdf(a) * this.normalCdf(b);
    }
    if (rho >= 1.0) {
      return this.normalCdf(Math.min(a, b));
    }
    if (rho <= -1.0) {
      return Math.max(0.0, this.normalCdf(a) - this.normalCdf(-b));
    }

    const nA = this.normalCdf(a);
    const nB = this.normalCdf(b);
    const maxTheta = Math.asin(Math.max(-0.99999999, Math.min(0.99999999, rho)));

    // 32-point composite Simpson's rule over [0, maxTheta]
    const nSteps = 64;
    const h = maxTheta / nSteps;
    let sum = 0.0;

    for (let i = 0; i <= nSteps; i++) {
      const theta = i * h;
      const sinTheta = Math.sin(theta);
      const cos2Theta = Math.cos(theta) * Math.cos(theta);
      const exponent = -(a * a - 2.0 * sinTheta * a * b + b * b) / (2.0 * Math.max(1e-12, cos2Theta));
      const val = Math.exp(exponent);

      let weight = 2.0;
      if (i === 0 || i === nSteps) {
        weight = 1.0;
      } else if (i % 2 === 1) {
        weight = 4.0;
      }
      sum += weight * val;
    }

    const integral = (h / 3.0) * sum;
    const result = nA * nB + (1.0 / (2.0 * Math.PI)) * integral;
    return Math.max(0.0, Math.min(1.0, result));
  }

  public static blackScholesPrice(
    spot: number,
    strike: number,
    time: number,
    r: number,
    q: number,
    vol: number,
    isCall: boolean
  ): { price: number; d1: number; d2: number; delta: number; vega: number } {
    if (time <= 0.0) {
      const intrinsic = isCall ? Math.max(0.0, spot - strike) : Math.max(0.0, strike - spot);
      return { price: intrinsic, d1: 0, d2: 0, delta: isCall ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0), vega: 0 };
    }

    const d1 = (Math.log(spot / strike) + (r - q + 0.5 * vol * vol) * time) / (vol * Math.sqrt(time));
    const d2 = d1 - vol * Math.sqrt(time);
    const dfR = Math.exp(-r * time);
    const dfQ = Math.exp(-q * time);

    const price = isCall
      ? spot * dfQ * this.normalCdf(d1) - strike * dfR * this.normalCdf(d2)
      : strike * dfR * this.normalCdf(-d2) - spot * dfQ * this.normalCdf(-d1);

    const delta = isCall ? dfQ * this.normalCdf(d1) : -dfQ * this.normalCdf(-d1);
    const vega = spot * dfQ * Math.sqrt(time) * this.normalPdf(d1);

    return { price, d1, d2, delta, vega };
  }

  /**
   * Solves for the critical underlying asset price S* at T1 satisfying:
   * Value(S*, T2 - T1; K2) = K1 via Newton-Raphson.
   */
  public static solveCriticalPrice(
    strike1: number,
    strike2: number,
    timeToUnderlyingExpiry: number,
    r: number,
    q: number,
    vol: number,
    underlyingIsCall: boolean
  ): number {
    let sStar = strike2; // Initial guess
    const maxIter = 100;
    const tol = 1e-9;

    for (let i = 0; i < maxIter; i++) {
      const bs = this.blackScholesPrice(sStar, strike2, timeToUnderlyingExpiry, r, q, vol, underlyingIsCall);
      const f = bs.price - strike1;
      const df = bs.delta; // d(OptionValue)/dS = delta

      if (Math.abs(f) < tol) {
        return sStar;
      }

      if (Math.abs(df) < 1e-8) {
        // Perturbation if derivative is too flat
        sStar = sStar * (f > 0 ? 0.9 : 1.1);
        continue;
      }

      const nextS = sStar - f / df;
      sStar = Math.max(1e-4, nextS);
    }

    return sStar;
  }
}
