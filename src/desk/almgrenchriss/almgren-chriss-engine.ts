import { AlmgrenChrissParams, ExecutionSchedule, TrajectoryPoint } from './almgren-chriss-types';

export class AlmgrenChrissEngine {
  /**
   * Computes the optimal execution trajectory based on the classical Almgren-Chriss (2000) model.
   * Minimizes E[x] + lambda * V[x].
   */
  public static calculateTrajectory(params: AlmgrenChrissParams): ExecutionSchedule {
    const X = params.totalShares;
    const T = params.totalTime;
    const N = params.numIntervals;
    const tau = T / N;
    const sigma = params.volatility;
    const gamma = params.gamma;
    const eta = params.eta;
    const lambda = params.riskAversion;

    // Modified eta tilde for discrete time: eta_tilde = eta * (1 - 0.5 * gamma * tau / eta)
    // Often simplified as eta_tilde = eta
    const etaTilde = eta;

    // Urgency parameter kappa: cosh(kappa * tau) = 1 + 0.5 * (lambda * sigma^2 * tau^2 / eta_tilde)
    // For small tau, kappa ~ sqrt(lambda * sigma^2 / eta)
    const factor = (lambda * sigma * sigma * tau) / etaTilde;
    let kappa = 0.0;
    if (factor > 0) {
      // Arccosh(1 + 0.5 * factor * tau)
      const z = 1.0 + 0.5 * factor * tau;
      kappa = (1.0 / tau) * Math.log(z + Math.sqrt(z * z - 1.0));
    }

    const trajectory: TrajectoryPoint[] = [];
    let prevHoldings = X;

    for (let k = 0; k <= N; k++) {
      const t = k * tau;
      let xK = 0.0;

      if (k === 0) {
        xK = X;
      } else if (k === N) {
        xK = 0.0;
      } else {
        if (kappa > 0) {
          // Continuous approximation: x_j = X * sinh(kappa * (T - t)) / sinh(kappa * T)
          const num = Math.sinh(kappa * (T - t));
          const den = Math.sinh(kappa * T);
          xK = den > 0 ? X * (num / den) : 0;
        } else {
          // TWAP linear schedule when lambda = 0 (risk-neutral)
          xK = X * (1.0 - t / T);
        }
      }

      const tradeSize = k === 0 ? 0 : prevHoldings - xK;
      const tradeRate = k === 0 ? 0 : tradeSize / tau;

      trajectory.push({
        time: t,
        holdingsRemaining: xK,
        tradeSize,
        tradeRate,
      });

      prevHoldings = xK;
    }

    // Calculate Expected Total Cost E[x] = 0.5 * gamma * X^2 + eta_tilde * sum(tradeSize^2 / tau)
    let sumTradeSq = 0.0;
    let sumHoldingsSq = 0.0;

    for (let i = 1; i <= N; i++) {
      const nk = trajectory[i].tradeSize;
      sumTradeSq += (nk * nk) / tau;
      // Variance V[x] = sigma^2 * sum(tau * holdings^2)
      const xAvg = trajectory[i].holdingsRemaining;
      sumHoldingsSq += xAvg * xAvg * tau;
    }

    const expectedCost = 0.5 * gamma * X * X + etaTilde * sumTradeSq;
    const variance = sigma * sigma * sumHoldingsSq;
    const halfLife = kappa > 0 ? 1.0 / kappa : Infinity;

    return {
      trajectory,
      expectedCost,
      variance,
      halfLife,
    };
  }
}
