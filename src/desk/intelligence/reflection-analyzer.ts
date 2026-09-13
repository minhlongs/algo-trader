/**
 * Reflection Engine Analyzers
 * Level 1 pure math verification and Level 2 LLM/numerical outcome analysis
 */

import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import {
  TradeOutcome,
  ReflectionResult,
  RawL2,
  SLIPPAGE_WARN_PCT,
  LATENCY_WARN_MS,
} from './reflection-types';

export const L2_SYSTEM = `You are a systematic trading analyst. Analyze a completed trade and respond ONLY with valid JSON:
{
  "lesson": string (1-2 sentences),
  "parameterAdjustments": [{ "param": string, "currentValue": number, "suggestedValue": number, "reason": string }]
}`;

/** Level 1 — pure math check for slippage, latency, and open status */
export function level1Check(trade: TradeOutcome): ReflectionResult['level1_logic'] {
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

/** Construct user prompt for Level 2 DeepSeek analysis */
export function buildL2Prompt(trade: TradeOutcome, l1: ReflectionResult['level1_logic']): string {
  return `Strategy: ${trade.strategy} | Market: ${trade.marketId} | Side: ${trade.side}
Entry: ${trade.entryPrice.toFixed(4)} | Exit: ${trade.exitPrice?.toFixed(4) ?? 'OPEN'}
P&L: ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(4)}
Expected edge: ${(trade.expectedEdge * 100).toFixed(2)}% | Actual: ${(trade.actualEdge * 100).toFixed(2)}%
Latency: ${trade.executionLatency}ms | Deviations: ${l1.deviations.join('; ') || 'none'}
Was this result skill or luck? What single parameter change has highest impact? Respond JSON only.`;
}

const defaultLlmRouter = new LlmRouter();

/** Level 2 — DeepSeek causal attribution and parameter suggestion */
export async function level2Llm(
  trade: TradeOutcome,
  l1: ReflectionResult['level1_logic'],
  router: LlmRouter = defaultLlmRouter,
): Promise<Pick<ReflectionResult, 'level2_outcome' | 'parameterAdjustments'>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: L2_SYSTEM },
    { role: 'user', content: buildL2Prompt(trade, l1) },
  ];
  const response = await router.chat({ messages, temperature: 0.2, maxTokens: 512 });
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
      .filter((a): a is { param: string; currentValue: number; suggestedValue: number; reason?: string } =>
        typeof a.param === 'string' && typeof a.currentValue === 'number' && typeof a.suggestedValue === 'number')
      .map((a) => ({
        param: a.param,
        currentValue: a.currentValue,
        suggestedValue: a.suggestedValue,
        reason: a.reason ?? '',
      })),
  };
}

/** Numerical-only Level 2 — used when LLM disabled or unavailable */
export function level2Numerical(
  trade: TradeOutcome,
): Pick<ReflectionResult, 'level2_outcome' | 'parameterAdjustments'> {
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
