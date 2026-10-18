/**
 * Compensatory Unwind Math — Pure Unwind Sizing, Cash Flow & Delta Exposure Helpers
 */

import { MultiTokenPool } from '../pool/multi-token-pool';
import { ArbitrageType, ExecutionLeg, UnwindResult } from '../types/arbitrage-types';

export type UnwindOrderExecutor = (
  outcomeIndex: number,
  action: 'BUY' | 'SELL',
  size: number
) => Promise<{ price: number; filled: number }>;

export interface UnwindOptions {
  opportunityType?: ArbitrageType;
  pool?: MultiTokenPool;
  unwindExecutor?: UnwindOrderExecutor;
  takerFeeBps?: number;
}

export function createEmptyUnwindResult(): UnwindResult {
  return {
    unwoundSets: 0,
    recoveredUsdc: 0,
    residualLossUsd: 0,
    completed: true,
    netResidualPositions: [],
    residualDeltaExposure: 0,
    postUnwindLegs: [],
  };
}

/** Net cash flow: BUY is cash outflow (-), SELL is cash inflow (+) */
export function computeInitialCashFlow(legs: ExecutionLeg[]): number {
  let netCashFlow = 0;
  for (const leg of legs) {
    netCashFlow += leg.action === 'BUY'
      ? -leg.filledSize * leg.avgFillPrice
      : leg.filledSize * leg.avgFillPrice;
  }
  return netCashFlow;
}

export function computeUnwindCashDelta(
  unwindAction: 'BUY' | 'SELL',
  liquidatedSize: number,
  unwindPrice: number,
  feeRate: number,
): number {
  return unwindAction === 'SELL'
    ? liquidatedSize * unwindPrice * (1 - feeRate)
    : -liquidatedSize * unwindPrice * (1 + feeRate);
}

export function computeFallbackUnwindPrice(
  unwindAction: 'BUY' | 'SELL',
  avgFillPrice: number,
): number {
  return unwindAction === 'SELL' ? avgFillPrice * 0.98 : avgFillPrice * 1.02;
}

export function buildFinalUnwindResult(
  qMatched: number,
  totalRecovered: number,
  netCashFlow: number,
  allCompleted: boolean,
  postUnwindLegs: ExecutionLeg[],
): UnwindResult {
  const netResidualPositions = postUnwindLegs.map((l) => l.filledSize);
  const maxPos = Math.max(...netResidualPositions);
  const minPos = Math.min(...netResidualPositions);
  const residualDeltaExposure = Math.abs(maxPos - minPos);
  const residualLossUsd = Math.max(0, -netCashFlow);
  const finalCompleted = allCompleted && residualDeltaExposure < 1e-6;

  return {
    unwoundSets: qMatched,
    recoveredUsdc: Number(totalRecovered.toFixed(4)),
    residualLossUsd: Number(residualLossUsd.toFixed(4)),
    completed: finalCompleted,
    netResidualPositions,
    residualDeltaExposure: Number(residualDeltaExposure.toFixed(6)),
    postUnwindLegs,
  };
}

export function verifyZeroDeltaExposure(legsOrPositions: ExecutionLeg[] | number[]): boolean {
  if (!legsOrPositions || legsOrPositions.length === 0) return true;
  const values = typeof legsOrPositions[0] === 'number'
    ? (legsOrPositions as number[])
    : (legsOrPositions as ExecutionLeg[]).map((l) => l.filledSize);
  return Math.abs(Math.max(...values) - Math.min(...values)) < 1e-6;
}
