/**
 * Wave 265: Lehalle & Neuman (2019) Limit Order Book Queue-Reactive Liquidation Math.
 * Strictly < 85 LOC, zero :any.
 */

import { QueueReactiveDecision, QueueReactiveLiquidationConfig, QueueState } from './types';

export function evaluateQueueReactiveLiquidation(
  queue: QueueState,
  remainingInventory: number,
  cfg: QueueReactiveLiquidationConfig
): QueueReactiveDecision {
  const { bidQueueDepth, askQueueDepth, tickSize } = queue;
  const { queueDepletionAlpha: alpha, marketOrderPenaltyEta: eta, passiveFillIntensityLambda: lambda, adverseSelectionRiskGamma: gamma } = cfg;

  if (bidQueueDepth < 0 || askQueueDepth < 0 || tickSize <= 0 || remainingInventory <= 0) {
    throw new Error('Invalid parameters for queue reactive liquidation');
  }

  // Queue imbalance ratio: higher ask queue implies stronger sell pressure
  const totalDepth = Math.max(1, bidQueueDepth + askQueueDepth);
  const queueImbalance = (bidQueueDepth - askQueueDepth) / totalDepth;

  // Depletion fill probability: higher lambda / (1 + alpha * Q_b) yields higher fill rate
  // When Q_b is deep, order sits behind queue, but in Lehalle-Neuman queue-reactive model:
  // fill rate at best quote scales with arrival intensity / (1 + depletion scale)
  const passiveFillProbability = Math.max(0.01, Math.min(0.99, 1 - Math.exp(-lambda / (1 + alpha * (bidQueueDepth / 1000)))));

  // Expected cost of aggressive market order execution: half-spread + market impact
  const halfSpread = 0.5 * tickSize;
  const aggressiveCost = halfSpread + eta * remainingInventory;

  // Expected cost of passive posting: risk of non-execution & adverse selection
  const adverseSelectionCost = gamma * (1 - passiveFillProbability) * remainingInventory * tickSize;
  const passiveExpectedCost = (1 - passiveFillProbability) * aggressiveCost * 0.5 + adverseSelectionCost;

  // Optimal threshold decision: switch to aggressive if queue imbalance is severely adverse (bid queue thin)
  if (passiveExpectedCost > aggressiveCost || queueImbalance < -0.6) {
    return {
      action: 'AGGRESSIVE_CROSS',
      postedOffsetTicks: 0,
      passiveFillProbability,
      expectedExecutionCost: aggressiveCost,
    };
  }

  // Optimal passive pegging offset
  const offsetTicks = queueImbalance > 0.4 ? 1 : 0;
  return {
    action: 'PASSIVE_POST',
    postedOffsetTicks: offsetTicks,
    passiveFillProbability,
    expectedExecutionCost: passiveExpectedCost,
  };
}
