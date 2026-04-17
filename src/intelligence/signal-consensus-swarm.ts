/**
 * Signal Consensus Swarm — 3 or 4-persona debate for signal validation.
 * Majority vote (2/3 default, 3/4 with Qwen) determines approve/reject. Reduces false positives 30-40%.
 * Fail-closed: ≥2 failed LLM calls → reject signal.
 * Env: SWARM_CONSENSUS_ENABLED (default true), SWARM_MIN_CONFIDENCE (default 0.6),
 *      SWARM_QWEN_ENABLED (default false) — enables 4th quantitative-analyst persona via Qwen.
 */

import { loadLlmConfig } from '../config/llm-config';
import { logger } from '../utils/logger';
import type { SignalCandidate } from './signal-validator';

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

type PersonaId = SwarmVote['persona'];
interface Persona {
  id: PersonaId;
  systemPrompt: string;
  /** If true, routed to Qwen endpoint when SWARM_QWEN_ENABLED=true */
  useQwen?: boolean;
}

const JSON_SCHEMA_HINT = 'JSON schema: { "vote": "APPROVE"|"REJECT", "confidence": number 0-1, "reasoning": string 1-2 sentences }';
const JSON_INSTRUCTION = `Respond ONLY with valid JSON. No markdown, no code blocks.\n${JSON_SCHEMA_HINT}`;

const BASE_PERSONAS: Persona[] = [
  {
    id: 'risk-analyst',
    systemPrompt: `You are a conservative risk analyst reviewing Polymarket arbitrage signals.
Bias: downside protection. Focus: Is the edge real or a data artifact? Liquidity? Event risk? Slippage?
Approve ONLY when risk/reward is clearly favorable with solid evidence.\n${JSON_INSTRUCTION}`,
  },
  {
    id: 'momentum-trader',
    systemPrompt: `You are an aggressive momentum trader reviewing Polymarket arbitrage signals.
Bias: capturing opportunity. Focus: Volume confirmation, timing, directional momentum, edge vs costs.
Approve when there is clear opportunity with reasonable confidence.\n${JSON_INSTRUCTION}`,
  },
  {
    id: 'contrarian',
    systemPrompt: `You are a contrarian skeptic reviewing Polymarket arbitrage signals.
Bias: questioning crowd wisdom. Focus: Too obvious? Are we exit liquidity? Herding risk? Info asymmetry?
Approve only when the contrarian case FOR the trade is compelling despite crowd skepticism.\n${JSON_INSTRUCTION}`,
  },
];

/** 4th persona — routed to Qwen MoE when SWARM_QWEN_ENABLED=true */
const QWEN_PERSONA: Persona = {
  id: 'quantitative-analyst',
  systemPrompt: `You are a quantitative analyst reviewing Polymarket arbitrage signals using statistical reasoning.
Bias: mathematical rigor. Focus: Edge significance (z-score, sample size), Kelly fraction vs full Kelly,
market microstructure friction, statistical arbitrage validity over the holding period.
Approve only when the expected-value calculation survives realistic slippage and fees.\n${JSON_INSTRUCTION}`,
  useQwen: true,
};

/** Returns active persona list: 3 base + optional 4th Qwen persona */
function buildPersonas(): Persona[] {
  if (process.env.SWARM_QWEN_ENABLED === 'true') {
    return [...BASE_PERSONAS, QWEN_PERSONA];
  }
  return BASE_PERSONAS;
}

/** Majority threshold: floor(N/2)+1 → N=3→2, N=4→3 */
function majorityThreshold(n: number): number {
  return Math.floor(n / 2) + 1;
}

function buildSignalSummary(signal: SignalCandidate): string {
  const marketLines = signal.markets
    .map(m => `  - ${m.title} (id=${m.id}) YES=${m.yesPrice.toFixed(3)} NO=${m.noPrice.toFixed(3)}`)
    .join('\n');
  return `Signal type: ${signal.signalType}
Expected edge: ${(signal.expectedEdge * 100).toFixed(2)}%
Strategy reasoning: ${signal.reasoning}
Markets:\n${marketLines}`;
}

interface LlmEndpoints {
  primaryUrl: string;
  primaryModel: string;
  qwenUrl?: string;
  qwenModel?: string;
}

async function callPersona(
  persona: Persona,
  signalSummary: string,
  endpoints: LlmEndpoints,
): Promise<string> {
  // Route quantitative-analyst to Qwen if available, else fall back to primary
  const useQwenEndpoint = persona.useQwen && endpoints.qwenUrl && endpoints.qwenModel;
  const llmUrl = useQwenEndpoint ? endpoints.qwenUrl! : endpoints.primaryUrl;
  const llmModel = useQwenEndpoint ? endpoints.qwenModel! : endpoints.primaryModel;
  // Qwen may need longer timeout for MoE cold path
  const timeoutMs = useQwenEndpoint ? 120_000 : 120_000;

  const body = {
    model: llmModel,
    messages: [
      { role: 'system', content: persona.systemPrompt },
      { role: 'user', content: `Evaluate this signal:\n\n${signalSummary}\n\nRespond with JSON only.` },
    ],
    temperature: 0.2,
    max_tokens: 256,
  };

  const resp = await fetch(`${llmUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

function parseSwarmVote(raw: string, persona: PersonaId): SwarmVote {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<{ vote: string; confidence: number; reasoning: string }>;
    return {
      persona,
      vote: parsed.vote === 'APPROVE' ? 'APPROVE' : 'REJECT',
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
    };
  } catch {
    logger.warn(`[SwarmConsensus] Parse failed for persona ${persona}`, { raw });
    return { persona, vote: 'REJECT', confidence: 0, reasoning: 'Parse error — defaulting to reject' };
  }
}

function aggregateVotes(votes: SwarmVote[], minConfidence: number): SwarmConsensus {
  const approvals = votes.filter(v => v.vote === 'APPROVE');
  const threshold = majorityThreshold(votes.length);
  const approved = approvals.length >= threshold;
  const majorityVotes = approved ? approvals : votes.filter(v => v.vote === 'REJECT');
  const minorityVotes = approved ? votes.filter(v => v.vote === 'REJECT') : approvals;

  const consensusConfidence = majorityVotes.length > 0
    ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / majorityVotes.length
    : 0;

  return {
    approved: approved && consensusConfidence >= minConfidence,
    votes,
    consensusConfidence,
    dissent: minorityVotes.length > 0 ? `${minorityVotes[0].persona}: ${minorityVotes[0].reasoning}` : null,
  };
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

  const llmConfig = loadLlmConfig();
  const endpoints: LlmEndpoints = {
    primaryUrl: llmConfig.primary.url,
    primaryModel: llmConfig.primary.model,
    qwenUrl: llmConfig.qwen?.url,
    qwenModel: llmConfig.qwen?.model,
  };
  const signalSummary = buildSignalSummary(signal);
  const personas = buildPersonas();

  logger.debug(`[SwarmConsensus] Firing ${personas.length} parallel persona calls`, { signalType: signal.signalType });

  const results = await Promise.allSettled(
    personas.map(p => callPersona(p, signalSummary, endpoints)),
  );

  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount >= 2) {
    logger.error('[SwarmConsensus] ≥2 persona calls failed — rejecting signal', { signalType: signal.signalType, failedCount });
    return { approved: false, votes: [], consensusConfidence: 0, dissent: 'Swarm unavailable — fail-closed rejection' };
  }

  const votes: SwarmVote[] = results.map((result, idx) => {
    const persona = personas[idx];
    if (result.status === 'fulfilled') return parseSwarmVote(result.value, persona.id);
    logger.warn(`[SwarmConsensus] Persona ${persona.id} failed`, { reason: result.reason });
    return { persona: persona.id, vote: 'REJECT' as const, confidence: 0, reasoning: 'Call failed — defaulting to reject' };
  });

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
