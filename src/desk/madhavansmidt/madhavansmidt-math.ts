export class MadhavanSmidtMath {
  public static mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((acc, v) => acc + v, 0) / arr.length;
  }

  /**
   * Bivariate multiple linear regression: Y = beta1 * X1 + beta2 * X2 (no intercept)
   * Solves normal equations: (X'X) * Beta = X'Y
   */
  public static multipleRegressionNoIntercept(
    y: number[],
    x1: number[],
    x2: number[]
  ): [number, number] {
    const n = Math.min(y.length, x1.length, x2.length);
    if (n < 2) return [0, 0];

    let sumX1X1 = 0;
    let sumX2X2 = 0;
    let sumX1X2 = 0;
    let sumX1Y = 0;
    let sumX2Y = 0;

    for (let i = 0; i < n; i++) {
      sumX1X1 += x1[i] * x1[i];
      sumX2X2 += x2[i] * x2[i];
      sumX1X2 += x1[i] * x2[i];
      sumX1Y += x1[i] * y[i];
      sumX2Y += x2[i] * y[i];
    }

    const det = sumX1X1 * sumX2X2 - sumX1X2 * sumX1X2;
    if (Math.abs(det) < 1e-12) {
      return [0, 0];
    }

    const b1 = (sumX2X2 * sumX1Y - sumX1X2 * sumX2Y) / det;
    const b2 = (sumX1X1 * sumX2Y - sumX1X2 * sumX1Y) / det;

    return [b1, b2];
  }
}
