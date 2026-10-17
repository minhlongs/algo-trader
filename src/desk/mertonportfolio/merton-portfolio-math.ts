import { MertonPortfolioConfig, MertonTrajectoryPoint } from './merton-portfolio-types';

export class MertonPortfolioMath {
  public static computeMertonFraction(
    mu: number,
    r: number,
    sigma: number,
    gamma: number
  ): number {
    const variance = sigma * sigma;
    if (variance < 1e-12 || gamma < 1e-6) {
      throw new Error('Variance and risk aversion must be strictly positive');
    }
    return (mu - r) / (gamma * variance);
  }

  public static computeConsumptionPropensity(
    t: number,
    T: number,
    gamma: number,
    rho: number,
    r: number,
    mu: number,
    sigma: number,
    epsilon = 1.0
  ): number {
    const tau = Math.max(0, T - t);
    const pi = this.computeMertonFraction(mu, r, sigma, gamma);
    const growth = r + pi * (mu - r) - 0.5 * gamma * pi * pi * sigma * sigma;

    if (Math.abs(gamma - 1.0) < 1e-6) {
      // Log utility: c^*(t) = rho / (1 - exp(-rho * tau) + epsilon * exp(-rho * tau))
      const denom = (1.0 - Math.exp(-rho * tau)) / rho + epsilon * Math.exp(-rho * tau);
      return 1.0 / Math.max(1e-8, denom);
    }

    const nu0 = (rho - (1.0 - gamma) * growth) / gamma;
    if (Math.abs(nu0) < 1e-8) {
      const denom = tau + Math.pow(epsilon, 1.0 / gamma);
      return 1.0 / Math.max(1e-8, denom);
    }

    const epsFactor = Math.pow(Math.max(1e-8, epsilon), 1.0 / gamma);
    const denom = (1.0 - Math.exp(-nu0 * tau)) / nu0 + epsFactor * Math.exp(-nu0 * tau);
    return 1.0 / Math.max(1e-8, denom);
  }

  public static generateTrajectory(
    config: MertonPortfolioConfig,
    pi: number
  ): MertonTrajectoryPoint[] {
    const { initialWealth: W0, timeHorizonYears: T, steps = 10 } = config;
    const r = config.riskFreeRatePct / 100.0;
    const mu = config.expectedReturnPct / 100.0;
    const sigma = config.volatilityPct / 100.0;
    const gamma = config.relativeRiskAversion;
    const rho = config.discountRatePct / 100.0;
    const eps = config.terminalWealthWeight ?? 1.0;

    const dt = T / steps;
    const points: MertonTrajectoryPoint[] = [];
    let currentW = W0;

    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      const propensity = this.computeConsumptionPropensity(t, T, gamma, rho, r, mu, sigma, eps);
      const cRate = propensity * currentW;

      points.push({
        timeYears: Number(t.toFixed(4)),
        optimalRiskyWeightPct: Number((pi * 100.0).toFixed(4)),
        optimalRiskFreeWeightPct: Number(((1.0 - pi) * 100.0).toFixed(4)),
        optimalConsumptionRate: Number(cRate.toFixed(4)),
        optimalConsumptionPropensityPct: Number((propensity * 100.0).toFixed(4)),
        expectedWealth: Number(currentW.toFixed(4)),
      });

      if (i < steps) {
        const drift = r + pi * (mu - r);
        const netGrowth = drift - propensity;
        currentW = Math.max(0, currentW * Math.exp(netGrowth * dt));
      }
    }

    return points;
  }
}
