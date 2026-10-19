/**
 * Cox-Ross-Rubinstein (1979) Binomial Mathematics
 *
 * u = exp(sigma * sqrt(dt))
 * d = 1 / u
 * p = (exp((r - q) * dt) - d) / (u - d)
 */

export class CRRMath {
  public static computeFactors(volatility: number, dt: number): { u: number; d: number } {
    const u = Math.exp(volatility * Math.sqrt(dt));
    const d = 1.0 / u;
    return { u, d };
  }

  public static computeRiskNeutralProb(
    u: number,
    d: number,
    riskFreeRate: number,
    dividendYield: number,
    dt: number
  ): number {
    const growth = Math.exp((riskFreeRate - dividendYield) * dt);
    const p = (growth - d) / (u - d);
    if (p < 0 || p > 1) {
      throw new Error(`Arbitrage condition violated: risk neutral prob ${p.toFixed(4)} not in [0, 1]`);
    }
    return p;
  }
}
