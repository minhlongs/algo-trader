/**
 * Dual-Level Reflection Engine
 * Level 1 — Logic Check (pure math, no LLM): slippage, latency deviation
 * Level 2 — Outcome Analysis (optional DeepSeek): causal attribution + parameter suggestions
 * Results stored in ring buffer (last 100). Publishes to NATS on completion.
 *
 * Env: REFLECTION_ENABLED (default true), REFLECTION_USE_LLM (default true)
 */

import { loadLlmConfig } from '../../shared/config/llm-config';
import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { getMessageBus } from '../../shared/messaging/index';
import { logger } from '../../shared/utils/logger';

const llmRouter = new LlmRouter(loadLlmConfig() as any);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TradeOutcome {
  tradeId: string;
  marketId: string;
  strategy: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  exitPrice: number | null;
  pnl: number;
  expectedEdge: number;
  actualEdge: number;
  executionLatency: number; // ms from signal to fill
  timestamp: number;
}

export interface ReflectionResult {
  level1_logic: {
    executedCorrectly: boolean;
    deviations: string[];
  };
  level2_outcome: {
    profitable: boolean;
    pnl: number;
    edgeAccuracy: number; // actualEdge / expectedEdge ratio
    lesson: string;
  };
  parameterAdjustments: Array<{
    param: string;
    currentValue: number;
    suggestedValue: number;
    reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants & ring buffer
// ---------------------------------------------------------------------------

const SLIPPAGE_WARN_PCT   = 0.02; // 2% edge deviation triggers deviation flag
const LATENCY_WARN_MS     = 500;
const RING_BUFFER_SIZE    = 100;
const REFLECTION_TOPIC    = 'intelligence.reflection.completed';

const _ring: ReflectionResult[] = [];
let _head = 0;

function pushRing(r: ReflectionResult): void {
  if (_ring.length < RING_BUFFER_SIZE) { _ring.push(r); }
  else { _ring[_head] = r; _head = (_head + 1) % RING_BUFFER_SIZE; }
}

// ---------------------------------------------------------------------------
// Level 1 — pure math
// ---------------------------------------------------------------------------

function level1Check(trade: TradeOutcome): ReflectionResult['level1_logic'] {
  const deviations: string[] = [];
  const edgeDelta = Math.abs(trade.expectedEdge - trade.actualEdge);
  if (trade.expectedEdge > 0 && edgeDelta / trade.expectedEdge > SLIPPAGE_WARN_PCT) {
    deviations.push(`entry price slippage ${(edgeDelta / trade.expectedEdge * 100).toFixed(1)}% vs expected`);
  }
  if (trade.executionLatency > LATENCY_WARN_MS) {
    deviations.push(`execution latency ${trade.executionLatency}ms exceeds ${LATENCY_WARN_MS}ms target`);
  }
  if (trade.exitPrice === null) {
    deviations.push('trade still open — P&L unrealized');
  }
  return { executedCorrectly: deviations.length === 0, deviations };
}

// ---------------------------------------------------------------------------
// Level 2 — DeepSeek outcome analysis
// ---------------------------------------------------------------------------

const L2_SYSTEM = `You are a systematic trading analyst. Analyze a completed trade and respond ONLY with valid JSON:
{
  "lesson": string (1-2 sentences),
  "parameterAdjustments": [{ "param": string, "currentValue": number, "suggestedValue": number, "reason": string }]
}`;

function buildL2Prompt(trade: TradeOutcome, l1: ReflectionResult['level1_logic']): string {
  return `Strategy: ${trade.strategy} | Market: ${trade.marketId} | Side: ${trade.side}
Entry: ${trade.entryPrice.toFixed(4)} | Exit: ${trade.exitPrice?.toFixed(4) ?? 'OPEN'}
P&L: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(4)}
Expected edge: ${(trade.expectedEdge * 100).toFixed(2)}% | Actual: ${(trade.actualEdge * 100).toFixed(2)}%
Latency: ${trade.executionLatency}ms | Deviations: ${l1.deviations.join('; ') || 'none'}
Was this result skill or luck? What single parameter change has highest impact? Respond JSON only.`;
}

interface RawL2 {
  lesson?: string;
  parameterAdjustments?: Array<{ param?: string; currentValue?: number; suggestedValue?: number; reason?: string }>;
}

async function level2Llm(
  trade: TradeOutcome,
  l1: ReflectionResult['level1_logic'],
): Promise<Pick<ReflectionResult, 'level2_outcome' | 'parameterAdjustments'>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: L2_SYSTEM },
    { role: 'user', content: buildL2Prompt(trade, l1) },
  ];
  const response = await llmRouter.chat({ messages, temperature: 0.2, maxTokens: 512 });
  const raw = response.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(raw) as RawL2;
  const edgeAccuracy = trade.expectedEdge !== 0 ? trade.actualEdge / trade.expectedEdge : 0;

  return {
    level2_outcome: {
      profitable: trade.pnl > 0,
      pnl: trade.pnl,
      edgeAccuracy,
      lesson: typeof parsed.lesson === 'string' ? parsed.lesson : 'No lesson extracted.',
    },
    parameterAdjustments: (parsed.parameterAdjustments ?? [])
      .filter(a => a.param && typeof a.currentValue === 'number' && typeof a.suggestedValue === 'number')
      .map(a => ({ param: a.param as string, currentValue: a.currentValue as number, suggestedValue: a.suggestedValue as number, reason: a.reason ?? '' })),
  };
}

/** Numerical-only Level 2 — used when LLM disabled or unavailable */
function level2Numerical(trade: TradeOutcome): Pick<ReflectionResult, 'level2_outcome' | 'parameterAdjustments'> {
  return {
    level2_outcome: {
      profitable: trade.pnl > 0,
      pnl: trade.pnl,
      edgeAccuracy: trade.expectedEdge !== 0 ? trade.actualEdge / trade.expectedEdge : 0,
      lesson: 'LLM disabled — numerical metrics only.',
    },
    parameterAdjustments: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reflect on a completed trade.
 * Level 1 always runs (pure math). Level 2 uses LLM if REFLECTION_USE_LLM=true.
 * If LLM fails, falls back to numerical Level 2 with no parameter suggestions.
 */
export async function reflectOnTrade(trade: TradeOutcome): Promise<ReflectionResult> {
  if (process.env.REFLECTION_ENABLED === 'false') {
    logger.debug('[Reflection] Disabled', { tradeId: trade.tradeId });
    const acc = trade.expectedEdge !== 0 ? trade.actualEdge / trade.expectedEdge : 0;
    return { level1_logic: { executedCorrectly: true, deviations: [] }, level2_outcome: { profitable: trade.pnl > 0, pnl: trade.pnl, edgeAccuracy: acc, lesson: 'Reflection disabled.' }, parameterAdjustments: [] };
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

  logger.info('[Reflection] Complete', { tradeId: trade.tradeId, profitable: result.level2_outcome.profitable, edgeAccuracy: result.level2_outcome.edgeAccuracy.toFixed(3), adjustments: result.parameterAdjustments.length });
  return result;
}

/** Aggregate stats over the last 100 reflections in the ring buffer */
export function getReflectionSummary(): { count: number; winRate: number; avgEdgeAccuracy: number; avgSlippageViolations: number; commonDeviations: string[] } {
  if (_ring.length === 0) return { count: 0, winRate: 0, avgEdgeAccuracy: 0, avgSlippageViolations: 0, commonDeviations: [] };

  const wins = _ring.filter(r => r.level2_outcome.profitable).length;
  const avgEdge = _ring.reduce((s, r) => s + r.level2_outcome.edgeAccuracy, 0) / _ring.length;
  const avgSlip = _ring.reduce((s, r) => s + r.level1_logic.deviations.length, 0) / _ring.length;

  const tally: Record<string, number> = {};
  for (const r of _ring) {
    for (const d of r.level1_logic.deviations) {
      const key = d.split(' ').slice(0, 2).join(' ');
      tally[key] = (tally[key] ?? 0) + 1;
    }
  }
  const commonDeviations = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);

  return { count: _ring.length, winRate: wins / _ring.length, avgEdgeAccuracy: avgEdge, avgSlippageViolations: avgSlip, commonDeviations };
}
