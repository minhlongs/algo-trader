import {
  DistanceToDefaultParams,
  DistanceToDefaultResult,
} from './distance2default-types.js';
import { DistanceToDefaultMath } from './distance2default-math.js';

export class DistanceToDefaultEngine {
  public static validate(params: DistanceToDefaultParams): void {
    if (params.equityValue <= 0) throw new Error('Equity value must be positive');
    if (params.equityVolatility <= 0) throw new Error('Equity volatility must be positive');
    if (params.debtFaceValue <= 0) throw new Error('Debt face value must be positive');
    if (params.timeHorizon <= 0) throw new Error('Time horizon must be positive');
  }

  /**
   * Solves the Merton (1974) simultaneous system for unobservable (V, sigma_V):
   * 1. E = V * N(d1) - D * exp(-r*T) * N(d2)
   * 2. sigma_E * E = N(d1) * sigma_V * V
   */
  public static solve(params: DistanceToDefaultParams): DistanceToDefaultResult {
    this.validate(params);
    const { equityValue: E, equityVolatility: sigmaE, debtFaceValue: D, riskFreeRate: r, timeHorizon: T } = params;
    const mu = params.expectedAssetReturn ?? r;

    let V = E + D; // Initial asset value approximation
    let sigmaV = (sigmaE * E) / V; // Initial asset volatility approximation
    let converged = false;
    let iter = 0;
    const maxIter = 100;
    const tol = 1e-7;

    while (iter < maxIter) {
      iter++;
      const { d1, d2 } = DistanceToDefaultMath.calculateD1D2(V, D, r, sigmaV, T);
      const Nd1 = DistanceToDefaultMath.normalCdf(d1);
      const Nd2 = DistanceToDefaultMath.normalCdf(d2);

      // Model equity value & update for V
      const modelE = V * Nd1 - D * Math.exp(-r * T) * Nd2;
      const f1 = modelE - E;

      // Model volatility relation: sigmaV = (sigmaE * E) / (V * Nd1)
      const targetSigmaV = Math.max(1e-4, (sigmaE * E) / (Math.max(1e-4, Nd1) * V));
      const f2 = targetSigmaV - sigmaV;

      if (Math.abs(f1) < tol * E && Math.abs(f2) < tol) {
        converged = true;
        break;
      }

      // Update parameters using damped iterative adjustment
      const dV = f1 / Math.max(0.1, Nd1);
      V = Math.max(E, V - 0.7 * dV);
      sigmaV = Math.max(1e-4, sigmaV + 0.7 * f2);
    }

    const sqrtT = Math.sqrt(T);
    const dd = (Math.log(V / D) + (mu - 0.5 * sigmaV * sigmaV) * T) / (sigmaV * sqrtT);
    const physicalDefaultProbability = DistanceToDefaultMath.normalCdf(-dd);

    const { d2 } = DistanceToDefaultMath.calculateD1D2(V, D, r, sigmaV, T);
    const riskNeutralDefaultProbability = DistanceToDefaultMath.normalCdf(-d2);

    // Continuous CDS spread: y(T) - r = -1/T * ln(v(0, T) / (D * exp(-rT)))
    const debtPrice = V - E; // Market value of debt
    const yieldDebt = -(1 / T) * Math.log(debtPrice / D);
    const creditSpreadBps = Math.max(0, (yieldDebt - r) * 10000);

    return {
      assetValue: V,
      assetVolatility: sigmaV,
      distanceToDefault: dd,
      physicalDefaultProbability,
      riskNeutralDefaultProbability,
      creditSpreadBps,
      leverageRatio: D / V,
      iterations: iter,
      converged,
    };
  }
}
