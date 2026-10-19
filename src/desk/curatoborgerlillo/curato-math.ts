/**
 * Wave 230: Curato, Borger & Lillo (2017) Optimal Execution with Endogenous Queue Transitions Math.
 * P_fill(q) = (mu / (lambda + mu)) * exp(-kappa * q).
 * Maker cost = (1 - P_fill) * (halfSpread + latencyRisk) + P_fill * adverseSelection.
 * Taker cost = halfSpread.
 * Strictly < 200 LOC, zero :any.
 */

import { QueueDynamicsConfig, LimitOrderQueueState, ExecutionDecision } from './curato-types';

export class CuratoMath {
  public static computeFillProbability(
    config: QueueDynamicsConfig,
    queuePosition: number
  ): number {
    const totalRate = config.cancellationRateLambda + config.arrivalRateMu;
    if (totalRate <= 0) return 0;
    const baseProb = config.arrivalRateMu / totalRate;
    return baseProb * Math.exp(-config.queueDepletionDecayKappa * queuePosition);
  }

  public static decideAction(
    config: QueueDynamicsConfig,
    state: LimitOrderQueueState
  ): ExecutionDecision {
    const pFill = this.computeFillProbability(config, state.queuePositionAhead);

    // Maker cost incorporates adverse selection on fill + non-execution risk on queue miss
    const makerCost =
      pFill * config.adverseSelectionAlpha +
      (1 - pFill) * (config.halfSpreadCostS + state.latencyPenaltyRisk);

    const takerCost = config.halfSpreadCostS;

    const action = makerCost < takerCost ? 'POST_PASSIVE_LIMIT' : 'SWEEP_AGGRESSIVE_MARKET';

    return {
      fillProbability: pFill,
      expectedMakerCost: makerCost,
      expectedTakerCost: takerCost,
      recommendedAction: action,
    };
  }
}
