/**
 * Augmented Signal Pipeline — fusion + AI validation gate.
 * Flow: raw signal → adaptive fusion → AI validation → validated/rejected
 * Env: AI_VALIDATION_ENABLED, AI_VALIDATION_MIN_CONFIDENCE
 */

import { validateSignal } from '../intelligence/signal-validator';
import type { SignalCandidate, ValidationResult } from '../intelligence/signal-validator';
import { runAdaptiveFusion, bufferSignal, toSignalInput } from './signal-fusion-buffer';
import { enrichWithKronos } from './kronos-enrichment';
import { getMessageBus } from '../../shared/messaging/index';
import { Topics } from '../../shared/messaging/topic-schema';
import { logger } from '../../shared/utils/logger';
import type { MessageEnvelope } from '../../shared/messaging/message-bus-interface';

const TOPIC_SIGNAL_VALIDATED = 'signal.validated';
const TOPIC_SIGNAL_REJECTED = 'signal.rejected';

const MIN_CONFIDENCE = Number(process.env.AI_VALIDATION_MIN_CONFIDENCE ?? 0.7);
const AI_VALIDATION_ENABLED = process.env.AI_VALIDATION_ENABLED !== 'false';

interface RawSignalData {
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

interface ValidatedSignalEnvelope {
  original: RawSignalData;
  validation: ValidationResult;
  passedAt: number;
}

interface RejectedSignalEnvelope {
  original: RawSignalData;
  validation: ValidationResult;
  rejectedAt: number;
  reason: 'ai-rejected' | 'low-confidence' | 'bypass-off';
}

/** Map raw NATS data to SignalCandidate — fills safe defaults */
function toSignalCandidate(raw: RawSignalData, topic: string): SignalCandidate {
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

/** Process a single raw signal through fusion + AI validation gate */
async function processSignal(envelope: MessageEnvelope<RawSignalData>): Promise<void> {
  const { topic, data: raw, source } = envelope;

  logger.debug('[AugmentedPipeline] Received signal', { topic, source });

  // Bypass mode — pass straight through (for backtesting)
  if (!AI_VALIDATION_ENABLED) {
    const bus = getMessageBus();
    if (bus.isConnected()) {
      const passEnvelope: ValidatedSignalEnvelope = {
        original: raw,
        validation: {
          valid: true,
          confidence: 1,
          reasoning: 'AI validation bypassed (AI_VALIDATION_ENABLED=false)',
          risks: [],
        },
        passedAt: Date.now(),
      };
      await bus.publish(TOPIC_SIGNAL_VALIDATED, passEnvelope, 'augmented-signal-pipeline');
    }
    return;
  }

  const candidate = toSignalCandidate(raw, topic);

  // Adaptive fusion — enrich signal with consensus data
  const currentInput = toSignalInput(candidate.signalType, raw.expectedEdge ?? 0);
  const fusionResult = runAdaptiveFusion(currentInput);

  if (fusionResult) {
    const fusionContext = [
      `[Fusion: direction=${fusionResult.fusedDirection} confidence=${fusionResult.fusedConfidence.toFixed(2)}]`,
      `[Consensus: ${fusionResult.fusedReasoning}]`,
    ].join(' ');
    candidate.reasoning = `${fusionContext} ${candidate.reasoning}`;
  }

  bufferSignal(toSignalInput(candidate.signalType, raw.expectedEdge ?? 0));

  // Kronos sidecar enrichment (when available)
  await enrichWithKronos(candidate);

  // AI validation gate
  let validation: ValidationResult;

  try {
    validation = await validateSignal(candidate);
  } catch (err) {
    logger.error('[AugmentedPipeline] Unexpected error during validation — rejecting signal', { err });
    validation = {
      valid: false,
      confidence: 0,
      reasoning: 'Unexpected validation error — signal rejected for safety',
      risks: ['internal-error'],
    };
  }

  const bus = getMessageBus();
  if (!bus.isConnected()) {
    logger.warn('[AugmentedPipeline] Message bus not connected — dropping signal');
    return;
  }

  const passed = validation.valid && validation.confidence >= MIN_CONFIDENCE;

  if (passed) {
    const passEnvelope: ValidatedSignalEnvelope = {
      original: raw,
      validation,
      passedAt: Date.now(),
    };
    await bus.publish(TOPIC_SIGNAL_VALIDATED, passEnvelope, 'augmented-signal-pipeline');
    logger.info('[AugmentedPipeline] Signal PASSED AI gate', {
      signalType: candidate.signalType,
      edge: candidate.expectedEdge,
      confidence: validation.confidence,
      fusionDirection: fusionResult?.fusedDirection,
      fusionConfidence: fusionResult?.fusedConfidence,
    });
  } else {
    const reason: RejectedSignalEnvelope['reason'] = !validation.valid ? 'ai-rejected' : 'low-confidence';
    const rejectEnvelope: RejectedSignalEnvelope = {
      original: raw,
      validation,
      rejectedAt: Date.now(),
      reason,
    };
    await bus.publish(TOPIC_SIGNAL_REJECTED, rejectEnvelope, 'augmented-signal-pipeline');
    logger.warn('[AugmentedPipeline] Signal REJECTED by AI gate', {
      signalType: candidate.signalType,
      edge: candidate.expectedEdge,
      confidence: validation.confidence,
      reason,
      fusionDirection: fusionResult?.fusedDirection,
      aiReasoning: validation.reasoning,
      risks: validation.risks,
    });
  }
}

type Unsubscriber = () => void;

export async function startAugmentedSignalPipeline(): Promise<() => Promise<void>> {
  const bus = getMessageBus();
  const unsubs: Unsubscriber[] = [];

  const signalTopics = [
    Topics.SIGNAL_SIMPLE_ARB,
    Topics.SIGNAL_CROSS_MARKET,
    Topics.SIGNAL_DELTA_NEUTRAL,
  ];

  logger.info('[AugmentedPipeline] Starting', {
    aiEnabled: AI_VALIDATION_ENABLED,
    minConfidence: MIN_CONFIDENCE,
    subscribingTo: signalTopics,
  });

  for (const topic of signalTopics) {
    const unsub = await bus.subscribe<RawSignalData>(topic, (envelope) => {
      processSignal(envelope).catch(err => {
        logger.error('[AugmentedPipeline] Unhandled error in processSignal', { topic, err });
      });
    });
    unsubs.push(unsub);
  }

  logger.info('[AugmentedPipeline] Subscribed to all signal topics');

  return async function stopAugmentedSignalPipeline(): Promise<void> {
    logger.info('[AugmentedPipeline] Stopping');
    for (const unsub of unsubs) {
      try { unsub(); } catch { /* ignore */ }
    }
  };
}
