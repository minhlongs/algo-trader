/**
 * Dual-Level Reflection Engine
 * Level 1 — Logic Check (pure math, no LLM): slippage, latency deviation
 * Level 2 — Outcome Analysis (optional DeepSeek): causal attribution + parameter suggestions
 * Results stored in ring buffer (last 100). Publishes to NATS on completion.
 *
 * Env: REFLECTION_ENABLED (default true), REFLECTION_USE_LLM (default true)
 */

import { getMessageBus } from '../../shared/messaging/index';
import { logger } from '../../shared/utils/logger';
import {
  TradeOutcome,
  ReflectionResult,
  RING_BUFFER_SIZE,
  REFLECTION_TOPIC,
} from './reflection-types';
import {
  level1Check,
  level2Llm,
  level2Numerical,
} from './reflection-analyzer';

export {
  TradeOutcome,
  ReflectionResult,
  RawL2,
  SLIPPAGE_WARN_PCT,
  LATENCY_WARN_MS,
  RING_BUFFER_SIZE,
  REFLECTION_TOPIC,
} from './reflection-types';

export {
  L2_SYSTEM,
  buildL2Prompt,
  level1Check,
  level2Llm,
  level2Numerical,
} from './reflection-analyzer';

const _ring: ReflectionResult[] = [];
let _head = 0;

function pushRing(r: ReflectionResult): void {
  if (_ring.length < RING_BUFFER_SIZE) {
    _ring.push(r);
  } else {
    _ring[_head] = r;
    _head = (_head + 1) % RING_BUFFER_SIZE;
  }
}

/**
 * Reflect on a completed trade.
 * Level 1 always runs (pure math). Level 2 uses LLM if REFLECTION_USE_LLM=true.
 * If LLM fails, falls back to numerical Level 2 with no parameter suggestions.
 */
export async function reflectOnTrade(trade: TradeOutcome): Promise<ReflectionResult> {
  if (process.env.REFLECTION_ENABLED === 'false') {
    logger.debug('[Reflection] Disabled', { tradeId: trade.tradeId });
    const acc = trade.expectedEdge !== 0 ? trade.actualEdge / trade.expectedEdge : 0;
    return {
      level1_logic: { executedCorrectly: true, deviations: [] },
      level2_outcome: { profitable: trade.pnl > 0, pnl: trade.pnl, edgeAccuracy: acc, lesson: 'Reflection disabled.' },
      parameterAdjustments: [],
    };
  }

  const l1 = level1Check(trade);
  logger.debug('[Reflection] L1 done', { tradeId: trade.tradeId, ok: l1.executedCorrectly, deviations: l1.deviations });

  let l2data: Pick<ReflectionResult, 'level2_outcome' | 'parameterAdjustments'>;
  if (process.env.REFLECTION_USE_LLM !== 'false') {
    try {
      l2data = await level2Llm(trade, l1);
      logger.debug('[Reflection] L2 LLM done', { tradeId: trade.tradeId });
    } catch (err) {
      logger.warn('[Reflection] L2 LLM failed, falling back to numerical', { tradeId: trade.tradeId, err });
      l2data = level2Numerical(trade);
    }
  } else {
    l2data = level2Numerical(trade);
  }

  const result: ReflectionResult = { level1_logic: l1, ...l2data };
  pushRing(result);

  // Non-blocking NATS publish — fail-safe
  try {
    await getMessageBus().publish(REFLECTION_TOPIC, { tradeId: trade.tradeId, ...result }, 'reflection-engine');
  } catch (err) {
    logger.warn('[Reflection] NATS publish failed', { tradeId: trade.tradeId, err });
  }

  logger.info('[Reflection] Complete', {
    tradeId: trade.tradeId,
    profitable: result.level2_outcome.profitable,
    edgeAccuracy: result.level2_outcome.edgeAccuracy.toFixed(3),
    adjustments: result.parameterAdjustments.length,
  });
  return result;
}

/** Aggregate stats over the last 100 reflections in the ring buffer */
export function getReflectionSummary(): {
  count: number;
  winRate: number;
  avgEdgeAccuracy: number;
  avgSlippageViolations: number;
  commonDeviations: string[];
} {
  if (_ring.length === 0) {
    return { count: 0, winRate: 0, avgEdgeAccuracy: 0, avgSlippageViolations: 0, commonDeviations: [] };
  }

  const wins = _ring.filter((r) => r.level2_outcome.profitable).length;
  const avgEdge = _ring.reduce((s, r) => s + r.level2_outcome.edgeAccuracy, 0) / _ring.length;
  const avgSlip = _ring.reduce((s, r) => s + r.level1_logic.deviations.length, 0) / _ring.length;

  const tally: Record<string, number> = {};
  for (const r of _ring) {
    for (const d of r.level1_logic.deviations) {
      const key = d.split(' ').slice(0, 2).join(' ');
      tally[key] = (tally[key] ?? 0) + 1;
    }
  }
  const commonDeviations = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  return {
    count: _ring.length,
    winRate: wins / _ring.length,
    avgEdgeAccuracy: avgEdge,
    avgSlippageViolations: avgSlip,
    commonDeviations,
  };
}
