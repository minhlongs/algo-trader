/**
 * Signal Validator
 * Sends arbitrage signal candidates to Claude-Fable (Claude-Fable-compatible) for AI validation.
 * Acts as the "vũ khí bí mật" gate — every signal must pass AI review before execution.
 *
 * Upgraded in Phase 3 to:
 * 1. Unify Swarm debate and final Validation checks into a single combined prompt format.
 * 2. Enforce serialization of LLM queries on the local GPU via GpuMutex to prevent thrashing.
 * 3. Cache verdicts using semantic cache (Redis-backed + local memory fallback).
 *
 * Facade: types, prompts, cache, aggregation, and GpuMutex live in signal-validator-* modules.
 */

import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { logger } from '../utils/logger';
import { GpuMutex } from './signal-validator-gpu-mutex';
import { getCombinedSystemPrompt, buildCombinedUserPrompt } from './signal-validator-prompts';
import { getCachedValidation, cacheValidation } from './signal-validator-cache';
import { parseCombinedResponse, verifyAndAggregateVotes } from './signal-validator-aggregate';
import type { SignalCandidate, ValidationResult, UnifiedValidationResult } from './signal-validator-types';

export type {
  SignalCandidate,
  ValidationResult,
  UnifiedValidationResult,
  SwarmVote,
  SwarmConsensus,
} from './signal-validator-types';

const llmRouter = new LlmRouter();

const RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 1_500;

const gpuMutex = new GpuMutex();

/** Raw LLM call — via LlmRouter (Claude-Fable-compatible chat completions) */
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
 * Validate a signal candidate using Claude-Fable AI.
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
