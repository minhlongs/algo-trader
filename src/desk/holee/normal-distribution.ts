export class NormalDistribution {
  private static readonly A1 = 0.254829592;
  private static readonly A2 = -0.284496736;
  private static readonly A3 = 1.421413741;
  private static readonly A4 = -1.453152027;
  private static readonly A5 = 1.061405429;
  private static readonly P = 0.3275911;

  public static pdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static cdf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;

    const t = 1.0 / (1.0 + this.P * absX);
    const y =
      1.0 -
      ((((this.A5 * t + this.A4) * t + this.A3) * t + this.A2) * t + this.A1) *
        t *
        Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }
}
