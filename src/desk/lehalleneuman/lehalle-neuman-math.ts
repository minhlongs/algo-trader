/**
 * Wave 219: Lehalle & Neuman (2019) Order Flow-Adjusted Execution Math.
 *
 * Implements optimal execution trajectory with order flow drift correction.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  LehalleNeumanConfig,
  OrderFlowTrajectoryPoint,
  LehalleNeumanExecutionSchedule,
} from './lehalle-neuman-types';

export class LehalleNeumanMath {
  /**
   * Computes trajectory with baseline Almgren-Chriss and Lehalle-Neuman order flow correction.
   */
  public static computeExecutionSchedule(
    config: LehalleNeumanConfig,
    initialImbalance: number,
    steps: number = 10,
  ): LehalleNeumanExecutionSchedule {
    const Q0 = config.totalSharesToExecute;
    const T = Math.max(1.0, config.timeHorizonSec);
    const lambda = Math.max(1e-7, config.riskAversionLambda);
    const eta = Math.max(1e-5, config.temporaryImpactEta);
    const sigma = Math.max(1e-4, config.volatilitySigma);
    const kappa = Math.max(0.01, config.orderFlowMeanReversionKappa);
    const beta = config.orderFlowImpactBeta;

    // Almgren-Chriss urgency parameter: omega = sqrt(lambda * sigma^2 / eta)
    const omega = Math.sqrt((lambda * (sigma * sigma)) / eta);
    const dt = T / steps;

    const trajectory: OrderFlowTrajectoryPoint[] = [];
    let remaining = Q0;
    let expectedCost = 0;

    for (let i = 0; i <= steps; i++) {
      const t = i * dt;
      const tau = Math.max(0.001, T - t);

      // Baseline Almgren-Chriss trading speed: v_AC = omega * Q(t) / tanh(omega * tau)
      const tanhOmegaTau = Math.tanh(omega * tau);
      const v_AC = (tanhOmegaTau > 1e-4) ? (omega * remaining) / tanhOmegaTau : remaining / tau;

      // Forecasted order flow imbalance: I(t) = I_0 * exp(-kappa * t)
      const currentImbalance = initialImbalance * Math.exp(-kappa * t);

      // Lehalle-Neuman adjustment: speed increases when trading with flow (momentum), slows when against
      const zeta = beta / (2.0 * eta * (kappa + omega));
      const v_flow_adj = zeta * currentImbalance;

      const optimalSpeed = Math.max(0, v_AC + v_flow_adj);

      trajectory.push({
        step: i,
        timeSec: Number(t.toFixed(2)),
        optimalSpeedSharesPerSec: Number(optimalSpeed.toFixed(3)),
        almgrenChrissBaselineSpeed: Number(v_AC.toFixed(3)),
        orderFlowAdjustmentSpeed: Number(v_flow_adj.toFixed(3)),
        remainingShares: Number(Math.max(0, remaining).toFixed(2)),
        orderFlowImbalance: Number(currentImbalance.toFixed(3)),
      });

      if (i < steps) {
        const traded = optimalSpeed * dt;
        expectedCost += eta * optimalSpeed * optimalSpeed * dt;
        remaining = Math.max(0, remaining - traded);
      }
    }

    return {
      config,
      initialImbalance,
      terminalRemainingShares: Number(remaining.toFixed(2)),
      expectedExecutionCostUsd: Number(expectedCost.toFixed(2)),
      trajectory,
    };
  }
}
