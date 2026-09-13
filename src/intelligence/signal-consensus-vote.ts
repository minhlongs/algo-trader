import { logger } from '../shared/utils/logger';
import type { SignalCandidate } from '../desk/intelligence/signal-validator';
import type { SwarmVote, SwarmConsensus } from './signal-consensus-types';

/**
 * Parse raw LLM response into structured vote.
 */
export function parseSwarmVote(raw: string, persona: string): SwarmVote {
  try {
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { vote?: string; confidence?: number; reasoning?: string };

    const vote = parsed.vote === 'APPROVE' || parsed.vote === 'REJECT'
      ? parsed.vote
      : 'REJECT';

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    const reasoning = typeof parsed.reasoning === 'string'
      ? parsed.reasoning
      : 'Parse error — defaulting to reject';

    return { persona: persona as SwarmVote['persona'], vote, confidence, reasoning };
  } catch {
    logger.warn(`[SwarmConsensus] Parse failed for persona ${persona}`, { raw: raw.slice(0, 200) });
    return {
      persona: persona as SwarmVote['persona'],
      vote: 'REJECT',
      confidence: 0,
      reasoning: 'Parse error — defaulting to reject',
    };
  }
}

/**
 * Aggregate votes into consensus decision.
 */
export function aggregateVotes(votes: SwarmVote[], minConfidence: number): SwarmConsensus {
  if (votes.length === 0) {
    return { approved: false, votes: [], consensusConfidence: 0, dissent: 'No votes cast' };
  }

  const approveCount = votes.filter(v => v.vote === 'APPROVE').length;
  const totalVotes = votes.length;
  const majorityThreshold = totalVotes >= 4 ? totalVotes * 0.75 : totalVotes * 0.5;
  const approved = approveCount >= majorityThreshold;

  const majorityVotes = votes.filter(v =>
    approved ? v.vote === 'APPROVE' : v.vote === 'REJECT',
  );
  const consensusConfidence = majorityVotes.length > 0
    ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / majorityVotes.length
    : 0;

  const minorityVotes = votes.filter(v => {
    if (!approved && v.vote === 'APPROVE') return true;
    if (approved && v.vote === 'REJECT' && v.confidence >= 0.7) return true;
    return v.confidence < minConfidence;
  });

  const dissent = minorityVotes.length > 0
    ? `${minorityVotes[0].persona}: ${minorityVotes[0].reasoning}`
    : null;

  return {
    approved: approved && consensusConfidence >= minConfidence,
    votes,
    consensusConfidence,
    dissent,
  };
}

/**
 * Build a human-readable summary of the signal for LLM analysis.
 */
export function buildSignalSummary(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => ` - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');
  return `Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}
Markets:
${marketLines}`;
}
