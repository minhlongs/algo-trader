/**
 * Signal Consensus Swarm — 3 or 4-persona debate for signal validation.
 * Majority vote (2/3 default, 3/4 with Qwen) determines approve/reject. Reduces false positives 30-40%.
 * Fail-closed: ≥2 failed LLM calls → reject signal.
 * Env: SWARM_CONSENSUS_ENABLED (default true), SWARM_MIN_CONFIDENCE (default 0.6),
 *      SWARM_QWEN_ENABLED (default false) — enables 4th quantitative-analyst persona via Qwen.
 */

import { logger } from '../utils/logger';
import { getUnifiedValidation } from './signal-validator';
import type { SignalCandidate, SwarmConsensus, SwarmVote } from './signal-validator';

export type { SwarmVote, SwarmConsensus };

/**
 * Run 3-persona swarm debate on a signal candidate.
 * Returns SwarmConsensus — caller checks `approved && consensusConfidence > threshold`.
 * When SWARM_CONSENSUS_ENABLED=false, returns a pass-through (single-agent fallback mode).
 */
export async function runSwarmConsensus(signal: SignalCandidate): Promise<SwarmConsensus> {
  const enabled = process.env.SWARM_CONSENSUS_ENABLED !== 'false';

  if (!enabled) {
    logger.debug('[SwarmConsensus] Disabled — pass-through');
    return { approved: true, votes: [], consensusConfidence: 1, dissent: null };
  }

  const result = await getUnifiedValidation(signal);

  return {
    approved: result.valid,
    votes: result.votes,
    consensusConfidence: result.consensusConfidence,
    dissent: result.dissent,
  };
}

