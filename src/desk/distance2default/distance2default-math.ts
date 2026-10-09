export class DistanceToDefaultMath {
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
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  public static calculateD1D2(
    V: number,
    D: number,
    r: number,
    sigmaV: number,
    T: number
  ): { d1: number; d2: number } {
    const sqrtT = Math.sqrt(T);
    const d1 =
      (Math.log(V / D) + (r + 0.5 * sigmaV * sigmaV) * T) /
      (sigmaV * sqrtT);
    const d2 = d1 - sigmaV * sqrtT;
    return { d1, d2 };
  }
}
