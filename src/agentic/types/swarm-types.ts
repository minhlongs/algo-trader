/**
 * Agent Swarm Types & Interfaces
 *
 * Defines contracts for multi-agent swarm proposals, consensus weighting,
 * lifecycle states, and operational telemetry.
 */

export type SwarmAgentTier = 'haiku' | 'sonnet' | 'opus';

export type SwarmAction = 'BUY' | 'SELL' | 'HOLD';

export type SwarmState =
  | 'INITIALIZED'
  | 'ANALYZING'
  | 'CONSENSUS'
  | 'EXECUTED'
  | 'TIMED_OUT';

export interface SwarmProposal {
  proposalId: string;
  agentName: string;
  tier: SwarmAgentTier;
  symbol: string;
  action: SwarmAction;
  confidence: number;
  price?: number;
  size?: number;
  rationale: string;
  timestamp: number;
}

export interface ConsensusWeight {
  tier: SwarmAgentTier;
  weight: number;
  minConfidence: number;
}

export interface SwarmConsensusResult {
  symbol: string;
  finalAction: SwarmAction;
  weightedConfidence: number;
  agreementRatio: number;
  proposals: SwarmProposal[];
  decidingTier: SwarmAgentTier;
  reachedAt: number;
}

export interface SwarmTelemetry {
  sessionId: string;
  symbol: string;
  dispatchedTier: SwarmAgentTier;
  fallbackTiersUsed: SwarmAgentTier[];
  proposalsCount: number;
  consensusScore: number;
  finalDecision: SwarmAction;
  executionLatencyMs: number;
  state: SwarmState;
  timedOut: boolean;
  timestamp: number;
}

export interface SwarmDispatchConfig {
  sessionId?: string;
  primaryTier?: SwarmAgentTier;
  fallbackChain?: SwarmAgentTier[];
  timeoutMs?: number;
  weights?: Partial<Record<SwarmAgentTier, number>>;
  minConsensusConfidence?: number;
}

export interface SwarmSignalInput {
  symbol: string;
  price?: number;
  context?: Record<string, string | number | boolean>;
}

export type SwarmAgentHandler = (
  tier: SwarmAgentTier,
  signal: SwarmSignalInput,
  timeoutMs: number,
) => Promise<SwarmProposal>;
