/**
 * Signal Consensus Swarm —
 * 3 or 4-persona debate for signal validation.
 * Majority vote (2/3 default, 3/4 with Qwen) determines approve/reject. Reduces false positives 30-40%.
 * Fail-closed: failed persona calls cast synthetic REJECT (confidence=0), tilting majority vote toward rejection.
 */

import { LlmRouter, ChatMessage } from '../lib/llm-router';
import { logger } from '../shared/utils/logger';
import type { SignalCandidate } from '../desk/intelligence/signal-validator';
import {
  type SwarmVote,
  type SwarmConsensus,
  type PersonaConfig,
  getSwarmPersonas,
} from './signal-consensus-types';
import {
  parseSwarmVote,
  aggregateVotes,
  buildSignalSummary,
} from './signal-consensus-vote';

export type { SwarmVote, SwarmConsensus, PersonaConfig } from './signal-consensus-types';
export { PERSONAS } from './signal-consensus-types';
export { parseSwarmVote, aggregateVotes, buildSignalSummary } from './signal-consensus-vote';

/**
 * Call LLM via LlmRouter for a single persona vote.
 */
async function callPersona(
  persona: PersonaConfig,
  signalSummary: string,
  router: LlmRouter,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: persona.systemPrompt },
    {
      role: 'user',
      content: `Analyze this trading signal and vote APPROVE or REJECT with your reasoning:\n\n${signalSummary}\n\nRespond with JSON:\n{ "vote": "APPROVE"|"REJECT", "confidence": 0.0-1.0, "reasoning": "your reasoning" }`,
    },
  ];

  const response = await router.chat({
    messages,
    temperature: 0.3,
    maxTokens: 512,
  });

  return response.content;
}

/**
 * Run 3-persona swarm debate on a signal candidate.
 * Returns SwarmConsensus — caller checks `approved && consensusConfidence > threshold`.
 * When SWARM_CONSENSUS_ENABLED=false, returns a pass-through (single-agent fallback mode).
 */
export async function runSwarmConsensus(signal: SignalCandidate): Promise<SwarmConsensus> {
  const enabled = process.env.SWARM_CONSENSUS_ENABLED !== 'false';
  const minConfidence = Number(process.env.SWARM_MIN_CONFIDENCE ?? 0.6);

  if (!enabled) {
    logger.debug('[SwarmConsensus] Disabled — pass-through');
    return { approved: true, votes: [], consensusConfidence: 1, dissent: null };
  }

  const activePersonas = getSwarmPersonas();

  logger.info('[SwarmConsensus] Starting consensus evaluation', {
    signalType: signal.signalType,
    personas: activePersonas.map(p => p.id),
  });

  const router = new LlmRouter();
  const signalSummary = buildSignalSummary(signal);

  // Run all persona calls in parallel
  const results = await Promise.all(
    activePersonas.map(persona =>
      callPersona(persona, signalSummary, router)
        .then(raw => ({ persona: persona.id, raw, status: 'fulfilled' as const }))
        .catch(err => {
          logger.warn(`[SwarmConsensus] Persona ${persona.id} failed`, { reason: err.message });
          return { persona: persona.id, status: 'rejected' as const, reason: err.message };
        }),
    ),
  );

  // Parse results — synthetic REJECT for each failed persona (fail-closed)
  const votes: SwarmVote[] = [
    ...results
      .filter(r => r.status === 'fulfilled')
      .map(r => parseSwarmVote(r.raw, r.persona)),
    ...results
      .filter(r => r.status === 'rejected')
      .map(r => ({
        persona: r.persona as SwarmVote['persona'],
        vote: 'REJECT' as const,
        confidence: 0,
        reasoning: `Persona call failed: ${r.reason}`,
      })),
  ];

  const consensus = aggregateVotes(votes, minConfidence);

  logger.info('[SwarmConsensus] Consensus reached', {
    signalType: signal.signalType,
    approved: consensus.approved,
    consensusConfidence: consensus.consensusConfidence,
    voteBreakdown: votes.map(v => `${v.persona}=${v.vote}(${v.confidence.toFixed(2)})`).join(', '),
    dissent: consensus.dissent,
  });

  return consensus;
}
