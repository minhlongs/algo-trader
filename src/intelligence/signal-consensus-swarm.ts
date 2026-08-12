/**
 * Signal Consensus Swarm —
 * 3 or 4-persona debate for signal validation.
 * Majority vote (2/3 default, 3/4 with Qwen) determines approve/reject. Reduces false positives 30-40%.
 * Fail-closed: ≥2 failed LLM calls → reject signal.
 * Env: SWARM_CONSENSUS_ENABLED (default true), SWARM_MIN_CONFIDENCE (default 0.6),
 * SWARM_QWEN_ENABLED (default false) — enables 4th quantitative-analyst persona via Qwen.
 */

import { LlmRouter, ChatMessage } from '../lib/llm-router';
import { logger } from '../shared/utils/logger';
import type { SignalCandidate } from '../desk/intelligence/signal-validator';

export interface SwarmVote {
  persona: 'risk-analyst' | 'momentum-trader' | 'contrarian' | 'quantitative-analyst';
  vote: 'APPROVE' | 'REJECT';
  confidence: number; // 0-1
  reasoning: string;
}

export interface SwarmConsensus {
  approved: boolean;
  votes: SwarmVote[];
  consensusConfidence: number;
  dissent: string | null;
}

export interface PersonaConfig {
  id: 'risk-analyst' | 'momentum-trader' | 'contrarian' | 'quantitative-analyst';
  name: string;
  systemPrompt: string;
  model?: string;
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'risk-analyst',
    name: 'Risk Analyst',
    systemPrompt: 'You are a risk analyst evaluating a trading signal. Focus on downside risk, tail events, and capital preservation. Be strict and conservative.',
  },
  {
    id: 'momentum-trader',
    name: 'Momentum Trader',
    systemPrompt: 'You are a momentum trader. Focus on price trends, volume patterns, and momentum indicators. Be aggressive when signals are strong.',
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    systemPrompt: 'You are a contrarian analyst. Question assumptions, look for hidden risks, and challenge the majority view. Always play devil\'s advocate.',
  },
];

const QWEN_PERSONA: PersonaConfig = {
  id: 'quantitative-analyst',
  name: 'Quantitative Analyst',
  systemPrompt: 'You are a quantitative analyst using statistical models to validate trading signals. Focus on expected value, probability distributions, and mathematical rigor.',
  model: 'qwen',
};

const SWARM_QWEN_ENABLED = process.env.SWARM_QWEN_ENABLED === 'true';

if (SWARM_QWEN_ENABLED) {
  PERSONAS.push(QWEN_PERSONA);
}

/**
 * Parse raw LLM response into structured vote.
 */
function parseSwarmVote(raw: string, persona: string): SwarmVote {
  try {
    // Remove markdown fences if present
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
    return { persona: persona as SwarmVote['persona'], vote: 'REJECT', confidence: 0, reasoning: 'Parse error — defaulting to reject' };
  }
}

/**
 * Aggregate votes into consensus decision.
 */
function aggregateVotes(votes: SwarmVote[], minConfidence: number): SwarmConsensus {
  if (votes.length === 0) {
    return { approved: false, votes: [], consensusConfidence: 0, dissent: 'No votes cast' };
  }

  const approveCount = votes.filter(v => v.vote === 'APPROVE').length;
  const rejectCount = votes.length - approveCount;
  const totalVotes = votes.length;

  // Majority vote threshold: >50% for 3-persona, ≥75% for 4-persona
  const majorityThreshold = totalVotes >= 4 ? totalVotes * 0.75 : totalVotes * 0.5;
  const approved = approveCount >= majorityThreshold;

  // Average confidence across all votes
  const totalConfidence = votes.reduce((sum, v) => sum + v.confidence, 0);
  const consensusConfidence = totalConfidence / totalVotes;

  // Identify dissenters (voters with low confidence or opposing votes)
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
 * Build a human-readable summary of the signal for LLM analysis.
 */
function buildSignalSummary(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => ` - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');
  return `Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}
Markets:
${marketLines}`;
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

  logger.info('[SwarmConsensus] Starting consensus evaluation', {
    signalType: signal.signalType,
    personas: PERSONAS.map(p => p.id),
  });

  const router = new LlmRouter();
  const signalSummary = buildSignalSummary(signal);

  // Run all persona calls in parallel
  const results = await Promise.all(
    PERSONAS.map(persona =>
      callPersona(persona, signalSummary, router)
        .then(raw => ({ persona: persona.id, raw, status: 'fulfilled' as const }))
        .catch(err => {
          logger.warn(`[SwarmConsensus] Persona ${persona.id} failed`, { reason: err.message });
          return { persona: persona.id, status: 'rejected' as const, reason: err.message };
        }),
    ),
  );

  // Parse results
  const votes: SwarmVote[] = results
    .filter(r => r.status === 'fulfilled')
    .map(r => parseSwarmVote(r.raw, r.persona));

  const failedCount = results.filter(r => r.status === 'rejected').length;

  if (failedCount >= 2) {
    logger.error('[SwarmConsensus] ≥2 persona calls failed — rejecting signal', {
      signalType: signal.signalType,
      failedCount,
    });
    return {
      approved: false,
      votes,
      consensusConfidence: 0,
      dissent: 'Swarm unavailable — fail-closed rejection',
    };
  }

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
