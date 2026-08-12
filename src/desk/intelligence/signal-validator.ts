/**
 * Signal Validator
 * Sends arbitrage signal candidates to DeepSeek (OpenAI-compatible) for AI validation.
 * Acts as the "vũ khí bí mật" gate — every signal must pass AI review before execution.
 *
 * Upgraded in Phase 3 to:
 * 1. Unify Swarm debate and final Validation check into a single combined prompt format.
 * 2. Enforce serialization of LLM queries on the local GPU via GpuMutex to prevent thrashing.
 * 3. Cache verdicts using semantic cache (Redis-backed + local memory fallback).
 */

import { loadLlmConfig } from '../config/llm-config';
import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { logger } from '../utils/logger';
import { getRedisClient } from '../redis/index';

const llmRouter = new LlmRouter(loadLlmConfig() as any);  // loadLlmConfig returns full config, constructor accepts Partial

export interface SignalCandidate {
  /** Strategy type that generated this signal */
  signalType: 'simple-arb' | 'cross-market' | 'delta-neutral';
  /** Markets involved in the trade */
  markets: Array<{
    id: string;
    title: string;
    yesPrice: number;
    noPrice: number;
  }>;
  /** Expected edge as a fraction (e.g. 0.05 = 5%) */
  expectedEdge: number;
  /** Human-readable reasoning from the strategy */
  reasoning: string;
}

export interface ValidationResult {
  /** Whether DeepSeek considers the signal a valid opportunity */
  valid: boolean;
  /** Confidence score 0–1 */
  confidence: number;
  /** AI explanation of the decision */
  reasoning: string;
  /** Identified risk factors (empty array if none) */
  risks: string[];
}

export interface SwarmVote {
  persona: 'risk-analyst' | 'momentum-trader' | 'contrarian' | 'quantitative-analyst';
  vote: 'APPROVE' | 'REJECT';
  confidence: number; // 0-1
  reasoning: string;
}

export interface SwarmConsensus {
  approved: boolean;
  votes: SwarmVote[];
  consensusConfidence: number; // average confidence of majority votes
  dissent: string | null; // minority reasoning — valuable contrarian signal
}

export interface UnifiedValidationResult extends ValidationResult {
  votes: SwarmVote[];
  consensusConfidence: number;
  dissent: string | null;
}

const RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 1_500;
const SEMANTIC_CACHE_TTL = 300; // 5 minutes cache for similar market state
const localMemoryCache = new Map<string, { value: UnifiedValidationResult; expires: number }>();

// Mutex to serialize GPU executions and prevent concurrent thrashing
class GpuMutex {
  private queue: (() => Promise<any>)[] = [];
  private running = false;

  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.triggerNext();
    });
  }

  private async triggerNext() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const task = this.queue.shift()!;
    try {
      await task();
    } finally {
      this.running = false;
      this.triggerNext();
    }
  }
}

const gpuMutex = new GpuMutex();

/** Dynamic system prompt construction */
function getCombinedSystemPrompt(): string {
  const qwenEnabled = process.env.SWARM_QWEN_ENABLED === 'true';
  const personasDescription = [
    `1. risk-analyst: Bias: downside protection. Focus: Is the edge real or a data artifact? Liquidity? Event risk? Slippage?`,
    `2. momentum-trader: Bias: capturing opportunity. Focus: Volume confirmation, timing, directional momentum, edge vs costs.`,
    `3. contrarian: Bias: questioning crowd wisdom. Focus: Too obvious? Are we exit liquidity? Herding risk? Info asymmetry?`,
  ];
  if (qwenEnabled) {
    personasDescription.push(
      `4. quantitative-analyst: Bias: mathematical rigor. Focus: Expected value, Kelly fraction, microstructure friction, z-score.`
    );
  }

  const allowedPersonas = qwenEnabled
    ? `"risk-analyst" | "momentum-trader" | "contrarian" | "quantitative-analyst"`
    : `"risk-analyst" | "momentum-trader" | "contrarian"`;

  return `You are a Polymarket arbitrage signal validator running a multi-persona debate panel.
Your job is to simulate a debate among specialized trading personas, reach consensus, and provide a final validation verdict.

The active personas are:
${personasDescription.join('\n')}

You must evaluate the signal from each persona's perspective. Then, synthesize the views to form a final consensus validation result.

Respond ONLY with a valid JSON object matching the following schema. Do not include markdown code fences (like \`\`\`json) or any explanation outside of the JSON.

JSON schema:
{
  "votes": [
    {
      "persona": ${allowedPersonas},
      "vote": "APPROVE" | "REJECT",
      "confidence": number (0.0 to 1.0),
      "reasoning": string (1-2 sentences)
    }
  ],
  "valid": boolean,
  "confidence": number (0.0 to 1.0),
  "reasoning": string (1-3 sentences of overall explanation),
  "risks": string[] (list of risk factors, empty array if none),
  "dissent": string | null (dissenting minority reasoning, or null if unanimous)
}`;
}

/** Build the user prompt from a signal candidate */
function buildCombinedUserPrompt(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => ` - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');

  return `Evaluate this Polymarket arbitrage signal candidate:

Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}

Markets involved:
${marketLines}

Evaluate each of the active personas, generate their votes, and output the final validation decision.`;
}

/** Generates semantic cache key based on rounded prices (1 cent bins) */
function getSemanticCacheKey(signal: SignalCandidate): string {
  const marketPart = signal.markets
    .map(m => `${m.id}_${m.yesPrice.toFixed(2)}_${m.noPrice.toFixed(2)}`)
    .sort()
    .join('|');
  return `semantic-cache:signal:${signal.signalType}:${marketPart}`;
}

async function getCachedValidation(signal: SignalCandidate): Promise<UnifiedValidationResult | null> {
  const key = getSemanticCacheKey(signal);

  // Try Redis first
  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);
    if (cached) {
      logger.info(`[SignalValidator] Semantic cache HIT (Redis): ${key}`);
      return JSON.parse(cached) as UnifiedValidationResult;
    }
  } catch (err) {
    logger.debug('[SignalValidator] Redis semantic cache read failed, trying local memory cache', { err });
  }

  // Try local memory fallback
  const localVal = localMemoryCache.get(key);
  if (localVal && localVal.expires > Date.now()) {
    logger.info(`[SignalValidator] Semantic cache HIT (Memory): ${key}`);
    return localVal.value;
  } else if (localVal) {
    localMemoryCache.delete(key);
  }

  return null;
}

async function cacheValidation(signal: SignalCandidate, result: UnifiedValidationResult): Promise<void> {
  const key = getSemanticCacheKey(signal);

  // Write to Redis
  try {
    const redis = getRedisClient();
    await redis.setex(key, SEMANTIC_CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    logger.debug('[SignalValidator] Redis semantic cache write failed', { err });
  }

  // Write to local memory
  localMemoryCache.set(key, {
    value: result,
    expires: Date.now() + SEMANTIC_CACHE_TTL * 1000,
  });

  // Prune local cache to prevent unbounded memory growth (max 1000 items)
  if (localMemoryCache.size > 1000) {
    const now = Date.now();
    // First, prune expired items
    for (const [k, val] of localMemoryCache.entries()) {
      if (val.expires <= now) {
        localMemoryCache.delete(k);
      }
    }
    // If still over the limit, prune the oldest entries (Map preserves insertion order)
    if (localMemoryCache.size > 1000) {
      for (const k of localMemoryCache.keys()) {
        localMemoryCache.delete(k);
        if (localMemoryCache.size <= 1000) {
          break;
        }
      }
    }
  }
}

/** Raw LLM call — via LlmRouter (OpenAI-compatible chat completions) */
async function callLlm(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const response = await llmRouter.chat({ messages, maxTokens: 1024, temperature: 0.1 });
  return response.content;
}

/** Robust JSON cleanup and parsing helper */
function parseCombinedResponse(raw: string): any {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      // Remove text before first '{' and after last '}'
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    logger.warn('[SignalValidator] Failed to parse combined response JSON', { err });
    return {};
  }
}

/** Mathematical aggregation validation on votes */
function verifyAndAggregateVotes(parsedJson: any, minConfidence: number): UnifiedValidationResult {
  const votes: SwarmVote[] = parsedJson.votes || [];

  // Normalize and validate votes structure
  const cleanVotes: SwarmVote[] = votes.map((v: any) => {
    return {
      persona: v.persona,
      vote: v.vote === 'APPROVE' ? 'APPROVE' : 'REJECT',
      confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : 0.5,
      reasoning: typeof v.reasoning === 'string' ? v.reasoning : 'No reasoning provided',
    };
  });

  const approvals = cleanVotes.filter(v => v.vote === 'APPROVE');
  const threshold = Math.floor(cleanVotes.length / 2) + 1; // N=3 -> 2 approvals; N=4 -> 3 approvals
  const approved = approvals.length >= threshold;

  const majorityVotes = approved ? approvals : cleanVotes.filter(v => v.vote === 'REJECT');
  const minorityVotes = approved ? cleanVotes.filter(v => v.vote === 'REJECT') : approvals;

  const consensusConfidence = majorityVotes.length > 0
    ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / majorityVotes.length
    : 0;

  const valid = approved && consensusConfidence >= minConfidence;

  const dissent = minorityVotes.length > 0
    ? `${minorityVotes[0].persona}: ${minorityVotes[0].reasoning}`
    : null;

  return {
    valid,
    confidence: consensusConfidence,
    reasoning: typeof parsedJson.reasoning === 'string' ? parsedJson.reasoning : 'Aggregated consensus decision',
    risks: Array.isArray(parsedJson.risks) ? parsedJson.risks.filter((r: any) => typeof r === 'string') : [],
    votes: cleanVotes,
    consensusConfidence,
    dissent,
  };
}

/**
 * Main entry point for both Swarm debate and final validation decision.
 * Uses cache and GPU mutex serialization.
 */
export async function getUnifiedValidation(signal: SignalCandidate): Promise<UnifiedValidationResult> {
  // Check semantic cache first
  const cached = await getCachedValidation(signal);
  if (cached) {
    return cached;
  }

  const systemPrompt = getCombinedSystemPrompt();
  const userPrompt = buildCombinedUserPrompt(signal);
  const minConfidence = Number(process.env.SWARM_MIN_CONFIDENCE ?? 0.6);

  const executeCall = async (): Promise<UnifiedValidationResult> => {
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        logger.debug(`[SignalValidator] Calling LLM via GPU Mutex, attempt ${attempt}/${RETRY_LIMIT}`, {
          signalType: signal.signalType,
          model: llmRouter['config'].primary.model,  // eslint-disable-line dot-notation
        });

        const raw = await callLlm(systemPrompt, userPrompt);
        const parsed = parseCombinedResponse(raw);
        const result = verifyAndAggregateVotes(parsed, minConfidence);

        logger.info('[SignalValidator] Unified validation & swarm debate success', {
          signalType: signal.signalType,
          valid: result.valid,
          votes: result.votes.map(v => `${v.persona}=${v.vote}(${v.confidence.toFixed(2)})`).join(', '),
          confidence: result.confidence.toFixed(2),
        });

        // Cache the verdict
        await cacheValidation(signal, result);

        return result;
      } catch (err) {
        logger.warn(`[SignalValidator] LLM Call attempt ${attempt}/${RETRY_LIMIT} failed`, { err });
        if (attempt < RETRY_LIMIT) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
      }
    }

    // Fail closed on error after retries
    return {
      valid: false,
      confidence: 0,
      reasoning: 'AI validation and swarm services unavailable after retries',
      risks: ['llm-unavailable'],
      votes: [],
      consensusConfidence: 0,
      dissent: 'Swarm and validator unavailable',
    };
  };

  // Enforce GPU serialization
  return gpuMutex.run(executeCall);
}

/**
 * Validate a signal candidate using DeepSeek AI.
 * Returns ValidationResult — caller checks `valid && confidence > threshold`.
 */
export async function validateSignal(signal: SignalCandidate): Promise<ValidationResult> {
  const result = await getUnifiedValidation(signal);
  return {
    valid: result.valid,
    confidence: result.confidence,
    reasoning: result.reasoning,
    risks: result.risks,
  };
}
