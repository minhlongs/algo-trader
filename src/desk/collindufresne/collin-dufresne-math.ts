export class CollinDufresneMath {
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
    const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * erf);
  }

  public static stationaryVariance(assetVol: number, reversionSpeed: number): number {
    return (assetVol * assetVol) / (2.0 * reversionSpeed);
  }

  public static conditionalMean(y0: number, yBar: number, lambda: number, t: number): number {
    return yBar + (y0 - yBar) * Math.exp(-lambda * t);
  }

  public static conditionalVariance(assetVol: number, lambda: number, t: number): number {
    const statVar = this.stationaryVariance(assetVol, lambda);
    return statVar * (1.0 - Math.exp(-2.0 * lambda * t));
  }

  public static calculateDefaultProbability(
    y0: number,
    yBar: number,
    lambda: number,
    assetVol: number,
    t: number
  ): number {
    if (t <= 1e-6) return y0 >= 0 ? 1.0 : 0.0;
    const mean = this.conditionalMean(y0, yBar, lambda, t);
    const variance = Math.max(1e-12, this.conditionalVariance(assetVol, lambda, t));
    const stdDev = Math.sqrt(variance);

    // Distance to distress threshold y_B = 0 (debt equals asset value)
    const z = mean / stdDev;
    // Upper tail probability with first-passage hazard factor
    const rawProb = this.stdNormCdf(z);
    // Continuous monitoring multiplier bounded in [0, 1)
    const pd = 1.0 - Math.exp(-1.5 * rawProb);
    return Math.max(0.0, Math.min(0.9999, pd));
  }

  public static calculateSpreadBps(defaultProb: number, recoveryRate: number, t: number): number {
    if (t <= 1e-6) return 0.0;
    const lgd = 1.0 - recoveryRate;
    const survivalEquivalent = Math.max(1e-8, 1.0 - lgd * defaultProb);
    const spread = -(1.0 / t) * Math.log(survivalEquivalent);
    return spread * 10000.0; // convert to basis points
  }
}
