export class Black76Math {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
  }

  public static calculateD1(F: number, K: number, T: number, sigma: number): number {
    return (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  }

  public static calculateD2(d1: number, T: number, sigma: number): number {
    return d1 - sigma * Math.sqrt(T);
  }
}
