export class LongstaffSchwartzMath {
  public static stdNormCdf(x: number): number {
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

  public static vasicekBond(r0: number, T: number, a: number, b: number, sigmaR: number): number {
    if (T <= 0.0) return 1.0;
    const B = (1.0 - Math.exp(-a * T)) / a;
    const term1 = (B - T) * (a * a * b - 0.5 * sigmaR * sigmaR) / (a * a);
    const term2 = (sigmaR * sigmaR * B * B) / (4.0 * a);
    const A = Math.exp(term1 - term2);
    return Math.max(1e-12, A * Math.exp(-B * r0));
  }

  public static defaultEventPresentValue(
    V: number,
    VB: number,
    T: number,
    r0: number,
    a: number,
    b: number,
    sigmaR: number,
    sigmaV: number,
    rho: number
  ): number {
    if (V <= VB) return 1.0;
    if (T <= 0.0) return 0.0;

    const pRiskless = this.vasicekBond(r0, T, a, b, sigmaR);
    const lnDist = Math.log(V / VB);
    const varV = sigmaV * sigmaV * T;
    const volV = Math.sqrt(varV);

    const driftV = (r0 - 0.5 * sigmaV * sigmaV + rho * sigmaV * sigmaR / Math.max(1e-4, a)) * T;
    const d1 = (-lnDist - driftV) / volV;
    const d2 = (-lnDist + driftV) / volV;

    const piRaw = this.stdNormCdf(d1) + Math.exp(Math.min(100.0, (2.0 * driftV * lnDist) / Math.max(1e-8, varV))) * this.stdNormCdf(d2);
    const piBounded = Math.min(1.0, Math.max(0.0, piRaw));

    return pRiskless * piBounded;
  }
}
