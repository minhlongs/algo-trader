import { MertonPortfolioConfig, MertonPortfolioResult } from './merton-portfolio-types';
import { MertonPortfolioMath } from './merton-portfolio-math';

export class MertonPortfolioEngine {
  public optimize(config: MertonPortfolioConfig): MertonPortfolioResult {
    this.validate(config);

    const r = config.riskFreeRatePct / 100.0;
    const mu = config.expectedReturnPct / 100.0;
    const sigma = config.volatilityPct / 100.0;
    const gamma = config.relativeRiskAversion;
    const rho = config.discountRatePct / 100.0;
    const T = config.timeHorizonYears;
    const eps = config.terminalWealthWeight ?? 1.0;

    const pi = MertonPortfolioMath.computeMertonFraction(mu, r, sigma, gamma);
    const initialPropensity = MertonPortfolioMath.computeConsumptionPropensity(
      0,
      T,
      gamma,
      rho,
      r,
      mu,
      sigma,
      eps
    );
    const initialConsumptionRate = initialPropensity * config.initialWealth;

    const trajectory = MertonPortfolioMath.generateTrajectory(config, pi);
    const expectedTerminalWealth = trajectory[trajectory.length - 1]!.expectedWealth;

    const annualizedPortfolioDrift = r + pi * (mu - r);
    const annualizedPortfolioVol = Math.abs(pi) * sigma;

    // CRRA Expected utility of terminal wealth
    const expectedUtility = Math.abs(gamma - 1.0) < 1e-6
      ? Math.log(Math.max(1e-6, expectedTerminalWealth))
      : (Math.pow(Math.max(1e-6, expectedTerminalWealth), 1.0 - gamma) - 1.0) / (1.0 - gamma);

    return {
      optimalRiskyWeightPct: Number((pi * 100.0).toFixed(4)),
      optimalRiskFreeWeightPct: Number(((1.0 - pi) * 100.0).toFixed(4)),
      initialConsumptionRate: Number(initialConsumptionRate.toFixed(4)),
      initialConsumptionPropensityPct: Number((initialPropensity * 100.0).toFixed(4)),
      expectedTerminalWealth: Number(expectedTerminalWealth.toFixed(4)),
      expectedUtility: Number(expectedUtility.toFixed(4)),
      annualizedPortfolioDriftPct: Number((annualizedPortfolioDrift * 100.0).toFixed(4)),
      annualizedPortfolioVolatilityPct: Number((annualizedPortfolioVol * 100.0).toFixed(4)),
      mertonRatio: Number(pi.toFixed(4)),
      trajectory,
    };
  }

  private validate(config: MertonPortfolioConfig): void {
    if (config.initialWealth <= 0) throw new Error('Initial wealth must be strictly positive');
    if (config.volatilityPct <= 0) throw new Error('Volatility must be strictly positive');
    if (config.relativeRiskAversion <= 0) throw new Error('Risk aversion gamma must be positive');
    if (config.timeHorizonYears <= 0) throw new Error('Time horizon must be positive');
  }
}
