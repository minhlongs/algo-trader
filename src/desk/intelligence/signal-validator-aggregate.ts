/**
 * Signal Validator — LLM response parsing and vote aggregation.
 * Split from signal-validator.ts (S16 tranche 3).
 */

import { logger } from '../utils/logger';
import type { RawSwarmJson, SwarmVote, UnifiedValidationResult } from './signal-validator-types';

/** Robust JSON cleanup and parsing helper */
export function parseCombinedResponse(raw: string): RawSwarmJson {
  try {
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      // Remove text before first '{' and after last '}'
      .replace(/^[^{]*/, '')
      .replace(/[^}]*$/, '')
      .trim();
    return JSON.parse(cleaned) as RawSwarmJson;
  } catch (err) {
    logger.warn('[SignalValidator] Failed to parse combined response JSON', { err });
    return {};
  }
}

/** Mathematical aggregation validation on votes */
export function verifyAndAggregateVotes(parsedJson: RawSwarmJson, minConfidence: number): UnifiedValidationResult {
  const votes: SwarmVote[] = (parsedJson.votes ?? []) as SwarmVote[];

  // Normalize and validate votes structure
  const cleanVotes: SwarmVote[] = votes.map(v => ({
    persona: v.persona as SwarmVote['persona'],
    vote: v.vote === 'APPROVE' ? 'APPROVE' : 'REJECT',
    confidence: typeof v.confidence === 'number' ? Math.max(0, Math.min(1, v.confidence)) : 0.5,
    reasoning: typeof v.reasoning === 'string' ? v.reasoning : 'No reasoning provided',
  }));

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
    risks: Array.isArray(parsedJson.risks) ? parsedJson.risks.filter(r => typeof r === 'string') : [],
    votes: cleanVotes,
    consensusConfidence,
    dissent,
  };
}
