export class KmvMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static normalCdf(x: number): number {
    if (x < -10.0) return 0.0;
    if (x > 10.0) return 1.0;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  public static calcD1(V: number, D: number, T: number, r: number, sigmaV: number): number {
    return (Math.log(V / D) + (r + 0.5 * sigmaV * sigmaV) * T) / (sigmaV * Math.sqrt(T));
  }

  public static calcCall(V: number, D: number, T: number, r: number, sigmaV: number): { value: number; d1: number; d2: number } {
    const d1 = this.calcD1(V, D, T, r, sigmaV);
    const d2 = d1 - sigmaV * Math.sqrt(T);
    const value = V * this.normalCdf(d1) - D * Math.exp(-r * T) * this.normalCdf(d2);
    return { value, d1, d2 };
  }
}
