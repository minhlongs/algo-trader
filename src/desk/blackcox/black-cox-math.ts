export class BlackCoxMath {
  public static normalCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2.0);
    return 0.5 * (1.0 + sign * y);
  }

  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }
}
