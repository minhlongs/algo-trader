/**
 * Signal Fusion Buffer
 * Maintains a time-windowed buffer of concurrent signals for adaptive fusion consensus.
 * When a new signal arrives, it is combined with recent signals and fused using
 * the meta-ensemble adaptive fusion engine.
 */

import { adaptiveFuse } from '../ml/meta-ensemble/adaptive-fusion';
import type { SignalInput } from '../intelligence/signal-fusion-engine';
import { logger } from '../../shared/utils/logger';

/** Window (ms) to buffer concurrent signals for fusion consensus */
const FUSION_WINDOW_MS = Number(process.env.FUSION_WINDOW_MS ?? 30_000);

interface BufferedSignal {
  input: SignalInput;
  receivedAt: number;
}

export interface FusionMetadata {
  fusedDirection: string;
  fusedConfidence: number;
  fusedReasoning: string;
  weightSource: Record<string, 'meta' | 'static'>;
}

/** Ring buffer of recent signals within the fusion window */
const _signalBuffer: BufferedSignal[] = [];

/** Evict signals older than FUSION_WINDOW_MS from the buffer */
function evictStaleSignals(): void {
  const cutoff = Date.now() - FUSION_WINDOW_MS;
  while (_signalBuffer.length > 0 && _signalBuffer[0]!.receivedAt < cutoff) {
    _signalBuffer.shift();
  }
}

/** Convert arbitrary signal data to SignalInput for the fusion engine */
export function toSignalInput(name: string, score: number): SignalInput {
  return { name, score, weight: 1.0 };
}

/**
 * Run adaptive fusion on current signal + buffered concurrent signals.
 * Returns fusion metadata or null if fusion cannot proceed.
 */
export function runAdaptiveFusion(
  currentInput: SignalInput,
): FusionMetadata | null {
  evictStaleSignals();

  // Combine current signal with any concurrent buffered signals
  const allInputs: SignalInput[] = [..._signalBuffer.map(b => b.input), currentInput];

  // Deduplicate by name — keep latest weight for each signal type
  const seen = new Map<string, SignalInput>();
  for (const inp of allInputs) {
    seen.set(inp.name, inp);
  }
  const uniqueInputs = Array.from(seen.values());

  if (uniqueInputs.length === 0) return null;

  try {
    const result = adaptiveFuse(uniqueInputs, { warnOnFallback: false });

    logger.debug('[FusionBuffer] Fusion result', {
      direction: result.direction,
      confidence: result.confidence,
      weightedScore: result.weightedScore,
      signalCount: uniqueInputs.length,
      weightSource: result.weightSource,
    });

    return {
      fusedDirection: result.direction,
      fusedConfidence: result.confidence,
      fusedReasoning: result.reasoning,
      weightSource: result.weightSource,
    };
  } catch (err) {
    logger.debug('[FusionBuffer] Fusion failed — proceeding without consensus', { err });
    return null;
  }
}

/** Add a signal to the buffer for future fusion with concurrent signals */
export function bufferSignal(input: SignalInput): void {
  _signalBuffer.push({ input, receivedAt: Date.now() });
}

/** Clear the buffer (useful in tests or shutdown) */
export function clearFusionBuffer(): void {
  _signalBuffer.length = 0;
}
