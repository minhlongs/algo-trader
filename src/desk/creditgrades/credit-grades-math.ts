export class CreditGradesMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    if (x === 0.0) return 0.5;
    if (x < -10.0) return 0.0;
    if (x > 10.0) return 1.0;
    const z = Math.abs(x);
    const t = 1.0 / (1.0 + 0.2316419 * z);
    const poly =
      t * (0.319381530 +
        t * (-0.356563782 +
          t * (1.781477937 +
            t * (-1.821255978 +
              t * 1.330274429))));
    const cdf = 1.0 - this.normalPdf(z) * poly;
    return x >= 0.0 ? cdf : 1.0 - cdf;
  }

  public static calculateAssetVolatility(
    s: number,
    d: number,
    sigmaE: number,
    recoveryRate: number
  ): number {
    const denominator = s + recoveryRate * d;
    return (sigmaE * s) / denominator;
  }

  public static calculateSurvivalProbability(
    s: number,
    d: number,
    recoveryRate: number,
    lambda: number,
    sigmaA: number,
    t: number
  ): number {
    if (t <= 0) return 1.0;

    const scaledDebt = recoveryRate * d;
    const leverageRatio = (s + scaledDebt) / scaledDebt;
    const lambdaSq = lambda * lambda;
    const xi = Math.sqrt(sigmaA * sigmaA * t + lambdaSq);

    const logRatio = Math.log(leverageRatio);
    const d1 = logRatio / xi - 0.5 * xi;
    const d2 = -logRatio / xi - 0.5 * xi;

    const term1 = this.normalCdf(d1);
    const term2 = (1.0 / leverageRatio) * this.normalCdf(d2);
    const survivalProb = term1 - term2;

    return Math.max(0.0, Math.min(1.0, survivalProb));
  }

  public static calculateDefaultProbability(
    s: number,
    d: number,
    recoveryRate: number,
    lambda: number,
    sigmaA: number,
    t: number
  ): number {
    const survivalProb = this.calculateSurvivalProbability(
      s,
      d,
      recoveryRate,
      lambda,
      sigmaA,
      t
    );
    return Math.max(0.0, Math.min(1.0, 1.0 - survivalProb));
  }

  public static calculateParCdsSpread(
    s: number,
    d: number,
    recoveryRate: number,
    lambda: number,
    sigmaA: number,
    r: number,
    t: number
  ): number {
    if (t <= 0) return 0.0;
    const defProb = this.calculateDefaultProbability(
      s,
      d,
      recoveryRate,
      lambda,
      sigmaA,
      t
    );
    if (defProb <= 1e-12) return 0.0;

    // Simpson's rule numerical integration of annuity: integral_0^T exp(-r*u) * Q(u) du
    const nSteps = 64;
    const h = t / nSteps;
    let sum = 0.0;

    for (let i = 0; i <= nSteps; i++) {
      const u = i * h;
      const qU = this.calculateSurvivalProbability(
        s,
        d,
        recoveryRate,
        lambda,
        sigmaA,
        u
      );
      const val = Math.exp(-r * u) * qU;

      let weight = 2.0;
      if (i === 0 || i === nSteps) {
        weight = 1.0;
      } else if (i % 2 === 1) {
        weight = 4.0;
      }
      sum += weight * val;
    }

    const annuity = (h / 3.0) * sum;
    if (annuity <= 1e-12) return 0.0;

    const protectionLeg = (1.0 - recoveryRate) * defProb;
    return protectionLeg / annuity;
  }
}
