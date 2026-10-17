/**
 * Atomic Multi-Leg Basket Execution Helpers
 */

import { MultiTokenPool } from '../pool/multi-token-pool';
import {
  ArbitrageLeg,
  ArbitrageOpportunity,
  ExecutionLeg,
} from '../types/arbitrage-types';
import { UnwindOrderExecutor } from './compensatory-unwind-handler';

export type LegExecutionFn = (
  leg: ArbitrageLeg,
  targetSize: number,
) => Promise<{ filledSize: number; avgPrice: number; status: 'FILLED' | 'PARTIAL' | 'FAILED' }>;

export interface CoordinatorConfig {
  executionStrategy?: 'concurrent' | 'staged';
  timeoutMs?: number;
  takerFeeBps?: number;
  gasCostUsd?: number;
  pool?: MultiTokenPool;
  legExecutor?: LegExecutionFn;
  unwindExecutor?: UnwindOrderExecutor;
}

export async function defaultBasketLegExec(
  leg: ArbitrageLeg,
  size: number,
  pool?: MultiTokenPool,
): Promise<{ filledSize: number; avgPrice: number; status: 'FILLED' | 'PARTIAL' | 'FAILED' }> {
  if (pool) {
    const res = pool.executeTrade({
      poolId: pool.poolId,
      outcomeIndex: leg.outcomeIndex,
      action: leg.action,
      amount: size * (leg.action === 'BUY' ? leg.price : 1),
    });
    return { filledSize: size, avgPrice: res.effectivePrice, status: 'FILLED' };
  }
  return { filledSize: size, avgPrice: leg.price, status: 'FILLED' };
}

export async function executeBasketLegWithTimeout(
  leg: ArbitrageLeg,
  idx: number,
  size: number,
  timeout: number,
  cfg?: CoordinatorConfig,
): Promise<ExecutionLeg> {
  const p = cfg?.legExecutor ? cfg.legExecutor(leg, size) : defaultBasketLegExec(leg, size, cfg?.pool);
  const tm = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
  try {
    const r = await Promise.race([p, tm]);
    return {
      legIndex: idx,
      outcomeIndex: leg.outcomeIndex,
      action: leg.action,
      targetSize: size,
      filledSize: r.filledSize,
      avgFillPrice: r.avgPrice,
      status: r.status,
    };
  } catch {
    return {
      legIndex: idx,
      outcomeIndex: leg.outcomeIndex,
      action: leg.action,
      targetSize: size,
      filledSize: 0,
      avgFillPrice: leg.price,
      status: 'FAILED',
    };
  }
}

export async function executeBasketLegsConcurrent(
  legs: ArbitrageLeg[],
  size: number,
  timeout: number,
  cfg?: CoordinatorConfig,
): Promise<ExecutionLeg[]> {
  return Promise.all(legs.map((leg, idx) => executeBasketLegWithTimeout(leg, idx, size, timeout, cfg)));
}

export async function executeBasketLegsStaged(
  legs: ArbitrageLeg[],
  size: number,
  timeout: number,
  cfg?: CoordinatorConfig,
): Promise<ExecutionLeg[]> {
  const results: ExecutionLeg[] = [];
  for (let idx = 0; idx < legs.length; idx++) {
    const res = await executeBasketLegWithTimeout(legs[idx]!, idx, size, timeout, cfg);
    results.push(res);
    if (res.status !== 'FILLED') break;
  }
  return results;
}

export function calcBasketSuccessPnl(
  opp: ArbitrageOpportunity,
  legs: ExecutionLeg[],
  feeRate: number,
  gasUsed: number,
): number {
  const targetSize = opp.maxExecutableSets;
  if (opp.type === 'UNDERPRICED_BASKET') {
    const cost = legs.reduce((acc, l) => acc + l.filledSize * l.avgFillPrice * (1 + feeRate), 0);
    return Number((targetSize * 1.0 - cost - gasUsed).toFixed(4));
  }
  const rev = legs.reduce((acc, l) => acc + l.filledSize * l.avgFillPrice * (1 - feeRate), 0);
  return Number((rev - targetSize * 1.0 - gasUsed).toFixed(4));
}
