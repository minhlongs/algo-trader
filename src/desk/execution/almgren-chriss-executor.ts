/**
 * Almgren-Chriss Optimal Execution Trajectory Calculator
 * Solves the closed-form calculus of variations trajectory minimizing market impact and risk penalty.
 *
 * @module desk/execution/almgren-chriss-executor
 */

import {
  AlmgrenChrissParameters,
  AlmgrenChrissTrajectoryPoint,
} from './algo-execution-types';

export class AlmgrenChrissExecutor {
  /**
   * Calculates the optimal trajectory of holdings and slice quantities.
   */
  public computeOptimalTrajectory(
    params: AlmgrenChrissParameters
  ): AlmgrenChrissTrajectoryPoint[] {
    const {
      totalQuantity,
      totalIntervals,
      intervalLengthSec,
      assetVolatilitySigma,
      riskAversionLambda,
      temporaryImpactEta,
      permanentImpactGamma,
    } = params;

    const tau = intervalLengthSec;
    const T = totalIntervals * tau;

    // Urgency parameter: kappa = sqrt((lambda * sigma^2) / eta)
    const numerator = Math.max(1e-9, riskAversionLambda * Math.pow(assetVolatilitySigma, 2));
    const kappa = Math.sqrt(numerator / Math.max(1e-9, temporaryImpactEta));

    const trajectory: AlmgrenChrissTrajectoryPoint[] = [];
    let previousHolding = totalQuantity;

    for (let step = 1; step <= totalIntervals; step++) {
      const t = step * tau;
      let holding: number;

      if (step === totalIntervals) {
        holding = 0;
      } else if (kappa * T < 1e-4) {
        // Linear TWAP limit as lambda -> 0
        holding = totalQuantity * (1 - t / T);
      } else {
        // Almgren-Chriss hyperbolic trajectory: x(t) = X_0 * sinh(kappa * (T - t)) / sinh(kappa * T)
        const sinhNum = Math.sinh(kappa * (T - t));
        const sinhDenom = Math.sinh(kappa * T);
        holding = totalQuantity * (sinhNum / sinhDenom);
      }

      holding = Number(Math.max(0, holding).toFixed(4));
      const tradeQty = Number((previousHolding - holding).toFixed(4));

      // Expected temporary and permanent impact for the slice
      const temporaryImpact = temporaryImpactEta * (tradeQty / tau);
      const permanentImpact = 0.5 * permanentImpactGamma * tradeQty;
      const expectedPriceImpact = Number((temporaryImpact + permanentImpact).toFixed(4));

      trajectory.push({
        step,
        holdingQuantity: holding,
        tradeQuantity: tradeQty,
        expectedPriceImpact,
      });

      previousHolding = holding;
    }

    return trajectory;
  }

  /**
   * Computes expected shortfall E[x] and variance V[x] of the trajectory.
   */
  public computeExpectedCostAndVariance(
    params: AlmgrenChrissParameters,
    trajectory: AlmgrenChrissTrajectoryPoint[]
  ): { expectedCost: number; variance: number } {
    let temporaryCostSum = 0;
    let varianceSum = 0;

    for (const pt of trajectory) {
      temporaryCostSum += (params.temporaryImpactEta * Math.pow(pt.tradeQuantity, 2)) / params.intervalLengthSec;
      varianceSum += Math.pow(pt.holdingQuantity, 2);
    }

    const permanentCost = 0.5 * params.permanentImpactGamma * Math.pow(params.totalQuantity, 2);
    const expectedCost = Number((permanentCost + temporaryCostSum).toFixed(2));
    const variance = Number(
      (Math.pow(params.assetVolatilitySigma, 2) * params.intervalLengthSec * varianceSum).toFixed(2)
    );

    return { expectedCost, variance };
  }
}
