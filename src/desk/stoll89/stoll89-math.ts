/**
 * Stoll (1989) Microstructure Econometrics & Autocovariance Functions
 */

export class Stoll89Math {
  public static autocovariance(series: number[], lag: number = 1): number {
    const n = series.length;
    if (n <= lag) return 0;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += series[i];
    }
    const mean = sum / n;

    let cov = 0;
    for (let i = lag; i < n; i++) {
      cov += (series[i] - mean) * (series[i - lag] - mean);
    }
    return cov / (n - lag);
  }

  public static mean(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return sum / values.length;
  }
}
