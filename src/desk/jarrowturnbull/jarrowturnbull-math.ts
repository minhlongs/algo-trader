/**
 * Jarrow-Turnbull (1995) Analytical Formulae for Risky Debt & CDS
 *
 * Risky Zero-Coupon Bond under fractional recovery of Treasury:
 *   v(0, T) = P(0, T) * [ delta + (1 - delta) * exp(-lambda * T) ]
 *
 * Yield spread:
 *   s(T) = - (1 / T) * ln( delta + (1 - delta) * exp(-lambda * T) )
 *
 * Continuous par CDS spread:
 *   s_CDS = (1 - delta) * lambda
 */

export class JarrowTurnbullMath {
  public static computeRiskFreeDiscount(r: number, T: number): number {
    return Math.exp(-r * T);
  }

  public static computeSurvivalProbability(lambda: number, T: number): number {
    return Math.exp(-lambda * T);
  }

  public static computeDefaultProbability(lambda: number, T: number): number {
    return 1 - Math.exp(-lambda * T);
  }

  public static computeRiskyZeroCouponPrice(
    r: number,
    lambda: number,
    delta: number,
    T: number,
    faceValue: number = 100
  ): number {
    if (T <= 0) return faceValue;
    const pRiskFree = this.computeRiskFreeDiscount(r, T);
    const survProb = this.computeSurvivalProbability(lambda, T);
    const recoveryMultiplier = delta + (1 - delta) * survProb;
    return faceValue * pRiskFree * recoveryMultiplier;
  }

  public static computeCreditSpread(
    lambda: number,
    delta: number,
    T: number
  ): number {
    if (T <= 0) return (1 - delta) * lambda;
    const survProb = this.computeSurvivalProbability(lambda, T);
    const recoveryMultiplier = delta + (1 - delta) * survProb;
    if (recoveryMultiplier <= 0) return 0;
    return - (1.0 / T) * Math.log(recoveryMultiplier);
  }

  public static computeParCdsSpread(
    r: number,
    lambda: number,
    delta: number,
    T: number,
    frequency: number = 4
  ): number {
    if (T <= 0 || lambda <= 0) return 0;

    const dt = 1.0 / frequency;
    const periods = Math.round(T * frequency);

    let premiumLeg = 0;
    let defaultLeg = 0;

    for (let i = 1; i <= periods; i++) {
      const tPrev = (i - 1) * dt;
      const tCurr = i * dt;

      const pCurr = this.computeRiskFreeDiscount(r, tCurr);
      const survCurr = this.computeSurvivalProbability(lambda, tCurr);
      premiumLeg += dt * pCurr * survCurr;

      const pMid = this.computeRiskFreeDiscount(r, (tPrev + tCurr) / 2);
      const probDefaultInterval =
        this.computeSurvivalProbability(lambda, tPrev) - survCurr;
      defaultLeg += (1 - delta) * pMid * probDefaultInterval;
    }

    if (premiumLeg <= 0) {
      return (1 - delta) * lambda;
    }

    return defaultLeg / premiumLeg;
  }
}
