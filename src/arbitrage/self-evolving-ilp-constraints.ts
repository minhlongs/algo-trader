/**
 * Self-Evolving ILP Constraints Engine
 * Analyzes missed arbitrage opportunities and uses DeepSeek to suggest ILP
 * constraint modifications. Suggestions are ADVISORY — caller must approve.
 * Rate limit: 1 analysis/hour. Hard limits: min_edge>=1.5%, max_exposure<=30%.
 */

import { loadLlmConfig } from '../shared/config/llm-config';
import { getMessageBus } from '../shared/messaging/index';
import { logger } from '../shared/utils/logger';

const ANALYSIS_THRESHOLD = 10;
const BUFFER_MAX = 50;
const RATE_LIMIT_MS = 3_600_000; // 1 hour
const LLM_TIMEOUT_MS = 90_000;
const HARD_MIN_EDGE = 0.015;     // 1.5% floor
const HARD_MAX_EXPOSURE = 0.30;  // 30% ceiling
const NATS_TOPIC = 'intelligence.ilp.evolution';

export interface MissedOpportunity {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  actualEdge: number;   // edge that existed when solver skipped it
  reason: string;       // e.g. "below min_edge threshold"
  timestamp: number;
}

export interface ConstraintSuggestion {
  constraintName: string; // "min_edge" | "max_market_exposure"
  currentValue: number;
  suggestedValue: number;
  reasoning: string;
  confidence: number;   // 0–1
}

export interface EvolutionResult {
  suggestions: ConstraintSuggestion[];
  missedOpportunitiesAnalyzed: number;
  estimatedImpact: string;
}

export interface CurrentConstraints {
  budgetUsdc: number;
  minEdge: number;           // decimal fraction, e.g. 0.025
  maxMarketExposure: number; // decimal fraction, e.g. 0.20
}

const missedBuffer: MissedOpportunity[] = [];
let lastAnalysisAt = 0;

/** Append a missed opportunity to the in-memory buffer (ring-buffer of 50). */
export function recordMissedOpportunity(opp: MissedOpportunity): void {
  missedBuffer.push(opp);
  if (missedBuffer.length > BUFFER_MAX) missedBuffer.shift();
  logger.debug('[SelfEvolvingILP] recorded missed', { buffered: missedBuffer.length, marketId: opp.marketId });
}

/** Current buffer depth — callers can use this to decide when to trigger analysis. */
export function getMissedBufferSize(): number {
  return missedBuffer.length;
}

/**
 * Analyze buffered missed opportunities and return constraint suggestions.
 * Returns empty suggestions if below threshold, rate-limited, or LLM fails.
 * Suggestions are ADVISORY — caller must approve before applying.
 */
export async function analyzeConstraints(
  current: CurrentConstraints,
): Promise<EvolutionResult> {
  const empty: EvolutionResult = { suggestions: [], missedOpportunitiesAnalyzed: 0, estimatedImpact: 'no analysis' };

  if (missedBuffer.length < ANALYSIS_THRESHOLD) {
    logger.debug('[SelfEvolvingILP] buffer below threshold', { buffered: missedBuffer.length });
    return empty;
  }

  const now = Date.now();
  if (now - lastAnalysisAt < RATE_LIMIT_MS) {
    logger.debug('[SelfEvolvingILP] rate limited');
    return empty;
  }

  lastAnalysisAt = now;
  const snapshot = missedBuffer.slice();
  missedBuffer.length = 0; // drain buffer after snapshot

  const result = await runEvolutionAnalysis(snapshot, current);

  // Publish to NATS (fire-and-forget)
  try {
    await getMessageBus().publish(NATS_TOPIC, result);
  } catch (err) {
    logger.warn('[SelfEvolvingILP] NATS publish failed (non-fatal)', { err });
  }

  return result;
}

async function runEvolutionAnalysis(opportunities: MissedOpportunity[], current: CurrentConstraints): Promise<EvolutionResult> {
  try {
    const raw = await callDeepSeek(opportunities, current);
    const suggestions = parseSuggestions(raw, current);
    logger.info('[SelfEvolvingILP] analysis complete', { analyzed: opportunities.length, suggestions: suggestions.length });
    return { suggestions, missedOpportunitiesAnalyzed: opportunities.length, estimatedImpact: estimateImpact(suggestions) };
  } catch (err) {
    logger.warn('[SelfEvolvingILP] LLM failed, returning empty suggestions', { err });
    return { suggestions: [], missedOpportunitiesAnalyzed: opportunities.length, estimatedImpact: 'analysis failed' };
  }
}

async function callDeepSeek(opportunities: MissedOpportunity[], current: CurrentConstraints): Promise<string> {
  const { primary: endpoint } = loadLlmConfig();

  const missedSummary = opportunities
    .map(o => `marketId=${o.marketId} edge=${(o.actualEdge * 100).toFixed(2)}% reason="${o.reason}"`)
    .join('\n');

  const prompt = `Given these missed arbitrage opportunities and current ILP constraints, suggest constraint modifications to capture more opportunities without increasing risk.

Current constraints:
- budget: ${current.budgetUsdc} USDC
- min_edge: ${(current.minEdge * 100).toFixed(2)}%
- max_market_exposure: ${(current.maxMarketExposure * 100).toFixed(1)}%

Missed opportunities (${opportunities.length}):
${missedSummary}

Respond ONLY with a JSON array. Each element must have:
- constraintName: string ("min_edge" or "max_market_exposure")
- currentValue: number (decimal fraction)
- suggestedValue: number (decimal fraction)
- reasoning: string (max 2 sentences)
- confidence: number (0.0–1.0)

Output nothing else.`;

  const body = {
    model: endpoint.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1024,
  };

  const resp = await fetch(`${endpoint.url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!resp.ok) throw new Error(`LLM HTTP ${resp.status}`);

  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '[]';
}

function parseSuggestions(raw: string, current: CurrentConstraints): ConstraintSuggestion[] {
  // Extract JSON array from response (LLM sometimes wraps in markdown fences)
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: unknown[];
  try {
    parsed = JSON.parse(match[0]) as unknown[];
  } catch {
    return [];
  }

  return (parsed as ConstraintSuggestion[])
    .filter(s => s && typeof s.constraintName === 'string' && typeof s.suggestedValue === 'number')
    .map(s => applySafetyLimits(s, current))
    .filter(s => s.suggestedValue !== s.currentValue); // drop no-op suggestions
}

function applySafetyLimits(s: ConstraintSuggestion, current: CurrentConstraints): ConstraintSuggestion {
  let safeValue = s.suggestedValue;

  if (s.constraintName === 'min_edge') {
    safeValue = Math.max(safeValue, HARD_MIN_EDGE); // floor 1.5%
    s.currentValue = current.minEdge;
  } else if (s.constraintName === 'max_market_exposure') {
    safeValue = Math.min(safeValue, HARD_MAX_EXPOSURE); // ceiling 30%
    s.currentValue = current.maxMarketExposure;
  }

  return { ...s, suggestedValue: safeValue };
}

function estimateImpact(suggestions: ConstraintSuggestion[]): string {
  if (suggestions.length === 0) return 'no changes suggested';

  const edgeSuggestion = suggestions.find(s => s.constraintName === 'min_edge');
  if (edgeSuggestion && edgeSuggestion.suggestedValue < edgeSuggestion.currentValue) {
    const pct = ((edgeSuggestion.currentValue - edgeSuggestion.suggestedValue) / edgeSuggestion.currentValue * 100).toFixed(0);
    return `+${pct}% more opportunities captured (lower min_edge)`;
  }

  return `${suggestions.length} constraint(s) tuned`;
}