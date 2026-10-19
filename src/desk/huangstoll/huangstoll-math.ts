export class HuangStollMath {
  /**
   * Bivariate OLS regression: y = beta_1 * x_1 + beta_2 * x_2
   * Returns estimated coefficients [beta_1, beta_2]
   */
  public static solve2DRegression(
    y: number[],
    x1: number[],
    x2: number[]
  ): { beta1: number; beta2: number } {
    const n = y.length;
    let s11 = 0;
    let s22 = 0;
    let s12 = 0;
    let sy1 = 0;
    let sy2 = 0;

    for (let i = 0; i < n; i++) {
      s11 += x1[i] * x1[i];
      s22 += x2[i] * x2[i];
      s12 += x1[i] * x2[i];
      sy1 += y[i] * x1[i];
      sy2 += y[i] * x2[i];
    }

    const det = s11 * s22 - s12 * s12;
    if (Math.abs(det) < 1e-12) {
      return { beta1: sy1 / Math.max(1e-6, s11), beta2: 0 };
    }

    const beta1 = (s22 * sy1 - s12 * sy2) / det;
    const beta2 = (s11 * sy2 - s12 * sy1) / det;

    return { beta1, beta2 };
  }

  /**
   * Computes conditional trade reversal probability:
   * pi = Prob(Q_t = Q_{t-1})
   */
  public static computeTradePersistence(directions: number[]): number {
    const n = directions.length;
    if (n < 2) return 0.5;

    let sameSignCount = 0;
    for (let i = 1; i < n; i++) {
      if (directions[i] === directions[i - 1]) {
        sameSignCount++;
      }
    }

    return sameSignCount / (n - 1);
  }
}
