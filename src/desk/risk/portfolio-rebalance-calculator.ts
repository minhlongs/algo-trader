/**
 * Portfolio Rebalance Calculator
 *
 * Pure functions to compute portfolio drift against allocation targets.
 *
 * @module desk/risk/portfolio-rebalance-calculator
 */

import type {
  AllocationTarget,
  PositionSnapshot,
  RebalanceStatus,
  DriftedPosition,
} from './portfolio-rebalance-types';

export interface ComputeStatusOptions {
  targets: readonly AllocationTarget[];
  positions: PositionSnapshot[];
  maxDriftPct: number;
  lastRebalanceAt: number | null;
  rebalancesToday: number;
}

export function computeRebalanceStatus(options: ComputeStatusOptions): RebalanceStatus {
  const { targets, positions, maxDriftPct, lastRebalanceAt, rebalancesToday } = options;

  if (targets.length === 0) {
    return {
      drift: 0,
      needsRebalance: false,
      lastRebalanceAt,
      rebalancesToday,
      driftedPositions: [],
    };
  }

  const totalUsdc = positions.reduce((sum, p) => sum + p.sizeUsdc, 0);
  if (totalUsdc <= 0) {
    return {
      drift: 0,
      needsRebalance: false,
      lastRebalanceAt,
      rebalancesToday,
      driftedPositions: [],
    };
  }

  let maxDrift = 0;
  const driftedPositions: DriftedPosition[] = [];

  for (const target of targets) {
    const pos = positions.find(p => p.tokenId === target.tokenId);
    const actualPct = pos ? pos.sizeUsdc / totalUsdc : 0;
    const drift = Math.abs(actualPct - target.targetPct);

    if (drift > maxDrift) maxDrift = drift;
    if (drift > maxDriftPct) {
      driftedPositions.push({
        tokenId: target.tokenId,
        targetPct: target.targetPct,
        actualPct,
        drift,
      });
    }
  }

  return {
    drift: maxDrift,
    needsRebalance: driftedPositions.length > 0,
    lastRebalanceAt,
    rebalancesToday,
    driftedPositions,
  };
}
