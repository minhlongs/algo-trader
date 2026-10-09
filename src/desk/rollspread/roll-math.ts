export class RollMath {
  /**
   * Computes successive price changes: deltaP[t] = price[t] - price[t - 1]
   */
  public static calculatePriceChanges(prices: number[]): number[] {
    const diffs: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      diffs.push(prices[i] - prices[i - 1]);
    }
    return diffs;
  }

  /**
   * Computes sample mean of array
   */
  public static mean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }

  /**
   * Computes sample variance of array
   */
  public static variance(values: number[], avg?: number): number {
    if (values.length < 2) return 0;
    const mu = avg ?? this.mean(values);
    const sumSq = values.reduce((acc, v) => acc + (v - mu) * (v - mu), 0);
    return sumSq / (values.length - 1);
  }

  /**
   * Computes first-order serial autocovariance Cov(deltaP_t, deltaP_{t-1})
   */
  public static autocovarianceLag1(deltaP: number[]): number {
    const n = deltaP.length;
    if (n < 2) return 0;

    const mu = this.mean(deltaP);
    let cov = 0;

    for (let t = 1; t < n; t++) {
      cov += (deltaP[t] - mu) * (deltaP[t - 1] - mu);
    }

    return cov / (n - 1);
  }

  /**
   * Roll (1984) effective spread calculation: S = 2 * sqrt(-Cov(deltaP_t, deltaP_{t-1}))
   */
  public static calculateEffectiveSpread(
    covLag1: number,
    handlePositive: 'zero' | 'magnitude' | 'warning' = 'zero'
  ): { spread: number; isNegative: boolean } {
    if (covLag1 < 0) {
      return {
        spread: 2.0 * Math.sqrt(-covLag1),
        isNegative: true,
      };
    }

    if (handlePositive === 'magnitude') {
      return {
        spread: 2.0 * Math.sqrt(covLag1),
        isNegative: false,
      };
    }

    return {
      spread: 0,
      isNegative: false,
    };
  }
}
