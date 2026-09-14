/**
 * Augmented Signal Pipeline Types & Helpers
 */

import { Topics } from '../../shared/messaging/topic-schema';
import type { SignalCandidate, ValidationResult } from '../intelligence/signal-validator';

export const TOPIC_SIGNAL_VALIDATED = 'signal.validated';
export const TOPIC_SIGNAL_REJECTED = 'signal.rejected';

export const MIN_CONFIDENCE = Number(process.env.AI_VALIDATION_MIN_CONFIDENCE ?? 0.7);
export const AI_VALIDATION_ENABLED = process.env.AI_VALIDATION_ENABLED !== 'false';

export interface RawSignalData {
  signalType?: string;
  markets?: Array<{
    id: string;
    title: string;
    yesPrice: number;
    noPrice: number;
  }>;
  expectedEdge?: number;
  reasoning?: string;
  [key: string]: unknown;
}

export interface ValidatedSignalEnvelope {
  original: RawSignalData;
  validation: ValidationResult;
  passedAt: number;
}

export interface RejectedSignalEnvelope {
  original: RawSignalData;
  validation: ValidationResult;
  rejectedAt: number;
  reason: 'ai-rejected' | 'low-confidence' | 'bypass-off';
}

/** Map raw NATS data to SignalCandidate — fills safe defaults */
export function toSignalCandidate(raw: RawSignalData, topic: string): SignalCandidate {
  const signalTypeMap: Record<string, SignalCandidate['signalType']> = {
    [Topics.SIGNAL_SIMPLE_ARB]: 'simple-arb',
    [Topics.SIGNAL_CROSS_MARKET]: 'cross-market',
    [Topics.SIGNAL_DELTA_NEUTRAL]: 'delta-neutral',
  };

  return {
    signalType: (raw.signalType as SignalCandidate['signalType']) ?? signalTypeMap[topic] ?? 'simple-arb',
    markets: raw.markets ?? [],
    expectedEdge: raw.expectedEdge ?? 0,
    reasoning: raw.reasoning ?? '(no reasoning provided)',
  };
}
