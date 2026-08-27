/**
 * Signal Validator — shared types.
 * Split from signal-validator.ts (S16 tranche 3). Pure type module, no runtime logic.
 */

import type { SwarmVote, SwarmConsensus } from '../../intelligence/signal-consensus-swarm';

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
  /** Whether the AI validator considers the signal a valid opportunity */
  valid: boolean;
  /** Confidence score 0–1 */
  confidence: number;
  /** AI explanation of the decision */
  reasoning: string;
  /** Identified risk factors (empty array if none) */
  risks: string[];
}

export type { SwarmVote, SwarmConsensus } from '../../intelligence/signal-consensus-swarm';

export interface UnifiedValidationResult extends ValidationResult {
  votes: SwarmVote[];
  consensusConfidence: number;
  dissent: string | null;
}

/** Raw LLM response shape after JSON cleanup */
export interface RawSwarmJson {
  votes?: Array<{
    persona?: string;
    vote?: string;
    confidence?: number;
    reasoning?: string;
  }>;
  reasoning?: string;
  risks?: unknown[];
}
