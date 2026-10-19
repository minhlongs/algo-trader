export class GknMath {
  /**
   * Sample mean
   */
  public static mean(data: number[]): number {
    if (data.length === 0) return 0;
    return data.reduce((acc, val) => acc + val, 0) / data.length;
  }

  /**
   * Sample autocovariance at lag k
   */
  public static autocovariance(data: number[], lag: number): number {
    const n = data.length;
    if (n <= lag) return 0;
    const m = this.mean(data);

    let cov = 0;
    for (let i = lag; i < n; i++) {
      cov += (data[i] - m) * (data[i - lag] - m);
    }
    return cov / (n - lag);
  }

  /**
   * Sample variance
   */
  public static variance(data: number[]): number {
    return this.autocovariance(data, 0);
  }
}
