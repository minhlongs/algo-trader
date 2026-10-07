import type {
  BinaryOptionQuote,
  ImpliedVolPoint,
  VolatilitySmileFit,
  VolatilitySurfaceGrid,
} from './volatility-surface-types';

export class VolatilitySurfaceCalculator {
  /**
   * Inverts standard normal CDF Phi(x) using rational approximation.
   */
  public inverseNormalCdf(p: number): number {
    const clampedP = Math.max(1e-12, Math.min(1 - 1e-12, p));
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    if (clampedP < pLow) {
      const q = Math.sqrt(-2 * Math.log(clampedP));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (clampedP <= pHigh) {
      const q = clampedP - 0.5;
      const r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    const q = Math.sqrt(-2 * Math.log(1 - clampedP));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  public invertBinaryImpliedVol(quote: BinaryOptionQuote): number | null {
    const { strike, spotPrice, timeToExpiryYears: t, riskFreeRate: r, binaryPrice: p } = quote;
    if (t <= 0 || strike <= 0 || spotPrice <= 0 || p <= 0 || p >= 1) {
      return null;
    }
    const d2 = this.inverseNormalCdf(p);
    const logMoneyness = Math.log(spotPrice / strike);
    // 0.5 * T * sigma^2 + d2 * sqrt(T) * sigma - (log(S/K) + r*T) = 0
    const A = 0.5 * t;
    const B = d2 * Math.sqrt(t);
    const C = -(logMoneyness + r * t);
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) return null;

    const sigma = (-B + Math.sqrt(discriminant)) / (2 * A);
    return sigma > 0 ? sigma : null;
  }

  public fitSmile(points: readonly ImpliedVolPoint[]): VolatilitySmileFit {
    if (points.length === 0) {
      return { a: 0, b: 0, c: 0, rSquared: 0, fittedPoints: [] };
    }
    if (points.length < 3) {
      const avgVol = points.reduce((sum, pt) => sum + pt.impliedVol, 0) / points.length;
      return { a: avgVol, b: 0, c: 0, rSquared: 1, fittedPoints: points };
    }

    let n = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    let v0 = 0, v1 = 0, v2 = 0;
    for (const pt of points) {
      const m = pt.moneyness;
      const m2 = m * m;
      const y = pt.impliedVol;
      n += 1;
      s1 += m;
      s2 += m2;
      s3 += m2 * m;
      s4 += m2 * m2;
      v0 += y;
      v1 += m * y;
      v2 += m2 * y;
    }

    const det = n * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-12) {
      const mean = v0 / n;
      return { a: mean, b: 0, c: 0, rSquared: 0, fittedPoints: points };
    }

    const detA = v0 * (s2 * s4 - s3 * s3) - s1 * (v1 * s4 - s3 * v2) + s2 * (v1 * s3 - s2 * v2);
    const detB = n * (v1 * s4 - s3 * v2) - v0 * (s1 * s4 - s3 * s2) + s2 * (s1 * v2 - v1 * s2);
    const detC = n * (s2 * v2 - v1 * s3) - s1 * (s1 * v2 - v1 * s2) + v0 * (s1 * s3 - s2 * s2);

    const a = detA / det;
    const b = detB / det;
    const c = detC / det;

    const yMean = v0 / n;
    let ssTot = 0, ssRes = 0;
    for (const pt of points) {
      const m = pt.moneyness;
      const fitted = a + b * m + c * m * m;
      ssTot += Math.pow(pt.impliedVol - yMean, 2);
      ssRes += Math.pow(pt.impliedVol - fitted, 2);
    }
    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

    return { a, b, c, rSquared, fittedPoints: points };
  }

  public buildSurfaceGrid(
    quotes: readonly BinaryOptionQuote[],
    spotPrice: number,
    riskFreeRate: number
  ): VolatilitySurfaceGrid {
    const smilesByExpiry = new Map<number, VolatilitySmileFit>();
    const quotesByExpiry = new Map<number, BinaryOptionQuote[]>();

    for (const q of quotes) {
      const list = quotesByExpiry.get(q.timeToExpiryYears) ?? [];
      list.push(q);
      quotesByExpiry.set(q.timeToExpiryYears, list);
    }

    for (const [expiry, quoteList] of quotesByExpiry.entries()) {
      const pts: ImpliedVolPoint[] = [];
      for (const q of quoteList) {
        const vol = this.invertBinaryImpliedVol(q);
        if (vol !== null) {
          pts.push({
            strike: q.strike,
            moneyness: Math.log(q.strike / q.spotPrice),
            impliedVol: vol,
            timeToExpiryYears: expiry,
          });
        }
      }
      pts.sort((p1, p2) => p1.moneyness - p2.moneyness);
      smilesByExpiry.set(expiry, this.fitSmile(pts));
    }

    return { spotPrice, riskFreeRate, smilesByExpiry };
  }
}
