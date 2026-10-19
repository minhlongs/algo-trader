/**
 * Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance Math.
 * Order statistics, empirical quantiles, and asymptotic spread factors.
 * Strictly < 180 LOC, zero :any.
 */

export class RqvMath {
  /**
   * Rational approximation of standard normal inverse CDF (Probit function) by Beasley-Springer-Moro.
   */
  public static normalInverseCdf(p: number): number {
    if (p <= 0.0) return -8.0;
    if (p >= 1.0) return 8.0;
    if (p === 0.5) return 0.0;

    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
      -2.549732539343734, 4.374664141464968, 2.938163982698783,
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
      3.754408661907416,
    ];

    const q = p - 0.5;
    if (Math.abs(q) <= 0.42) {
      const r = q * q;
      return (
        (q *
          (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r +
            a[5])) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
      );
    }

    const r = p < 0.5 ? p : 1.0 - p;
    const s = Math.log(-Math.log(r));
    const t =
      c[0] +
      s *
        (c[1] +
          s * (c[2] + s * (c[3] + s * (c[4] + s * c[5]))));
    const u =
      d[0] +
      s * (d[1] + s * (d[2] + s * (d[3] + s * 1.0)));
    const z = t / u;
    return p < 0.5 ? -z : z;
  }

  /**
   * Asymptotic quantile spread constant nu_1(alpha) = Phi^-1(alpha) - Phi^-1(1 - alpha).
   */
  public static calculateNu1(alpha: number): number {
    const zAlpha = this.normalInverseCdf(alpha);
    const z1MinusAlpha = this.normalInverseCdf(1.0 - alpha);
    return Math.max(1e-6, zAlpha - z1MinusAlpha);
  }

  /**
   * Empirical quantile from a sorted array of numbers (linear interpolation).
   */
  public static calculateQuantile(sortedValues: number[], q: number): number {
    const n = sortedValues.length;
    if (n === 0) return 0.0;
    if (n === 1) return sortedValues[0];

    const index = q * (n - 1);
    const low = Math.floor(index);
    const high = Math.ceil(index);
    const weight = index - low;

    return (1.0 - weight) * sortedValues[low] + weight * sortedValues[high];
  }
}
