export class LsbMath {
  public static mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((acc, v) => acc + v, 0) / arr.length;
  }

  /**
   * OLS Regression: Y = beta * X + alpha (no constant if fitIntercept = false)
   * Returns slope beta
   */
  public static olsSlope(x: number[], y: number[], fitIntercept: boolean = true): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    if (!fitIntercept) {
      let sumXX = 0;
      let sumXY = 0;
      for (let i = 0; i < n; i++) {
        sumXX += x[i] * x[i];
        sumXY += x[i] * y[i];
      }
      return sumXX > 1e-12 ? sumXY / sumXX : 0;
    }

    const meanX = this.mean(x);
    const meanY = this.mean(y);
    let covXY = 0;
    let varX = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      covXY += dx * (y[i] - meanY);
      varX += dx * dx;
    }

    return varX > 1e-12 ? covXY / varX : 0;
  }
}
