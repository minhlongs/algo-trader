/**
 * Signal Fusion Engine — pure mathematical signal combination.
 * Alternative to LLM-based consensus swarm for high-frequency price markets.
 *
 * fuseSignals(): weighted average → direction + confidence (no LLM).
 * updateWeights(): EMA-based self-learning feedback loop.
 *   newWeight = 0.9 * oldWeight + 0.1 * (correct ? 1.2 : 0.8)
 *
 * Direction thresholds: score > 0.1 = UP, < -0.1 = DOWN, else NEUTRAL.
 * Confidence = |weightedScore| clamped to [0, 1].
 */

import { logger } from '../shared/utils/logger';

export interface SignalInput {
  /** Signal identifier — e.g. 'momentum', 'volatility', 'mean-reversion' */
  name: string;
  /** Raw signal score: -1 (strong sell) to +1 (strong buy) */
  score: number;
  /** Relative importance weight: 0-1 */
  weight: number;
}

export interface FusionResult {
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  /** Normalized absolute strength of the fused signal: 0-1 */
  confidence: number;
  /** Weighted average of all signal scores: -1 to +1 */
  weightedScore: number;
  signals: SignalInput[];
  reasoning: string;
}

// ── Direction thresholds ──────────────────────────────────────────────────────

const UP_THRESHOLD = 0.1;
const DOWN_THRESHOLD = -0.1;

// Weight EMA parameters
const EMA_DECAY = 0.9;
const CORRECT_BOOST = 1.2;
const INCORRECT_DECAY = 0.8;
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 2.0;

// ── Core fusion ───────────────────────────────────────────────────────────────

/**
 * Fuse multiple signal inputs via weighted average.
 * Returns direction, confidence, and human-readable reasoning.
 *
 * If total weight is 0 (all weights zero), returns NEUTRAL with 0 confidence.
 */
export function fuseSignals(signals: SignalInput[]): FusionResult {
  if (signals.length === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      weightedScore: 0,
      signals,
      reasoning: 'No signals provided',
    };
  }

  // Clamp individual scores to [-1, 1] defensively
  const clamped = signals.map(s => ({
    ...s,
    score: Math.max(-1, Math.min(1, s.score)),
    weight: Math.max(0, s.weight),
  }));

  const totalWeight = clamped.reduce((sum, s) => sum + s.weight, 0);

  if (totalWeight === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      weightedScore: 0,
      signals: clamped,
      reasoning: 'All signal weights are zero — cannot determine direction',
    };
  }

  // Weighted average score in [-1, +1]
  const weightedScore = clamped.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;

  // Direction by threshold
  let direction: FusionResult['direction'];
  if (weightedScore > UP_THRESHOLD) direction = 'UP';
  else if (weightedScore < DOWN_THRESHOLD) direction = 'DOWN';
  else direction = 'NEUTRAL';

  // Confidence = absolute score magnitude, clamped to [0, 1]
  const confidence = Math.min(1, Math.abs(weightedScore));

  // Build reasoning summary
  const signalLines = clamped
    .map(s => `${s.name}=${s.score.toFixed(3)}(w=${s.weight.toFixed(2)})`)
    .join(', ');
  const reasoning = `Weighted score ${weightedScore.toFixed(3)} → ${direction} @ ${(confidence * 100).toFixed(1)}% confidence. Signals: [${signalLines}]`;

  logger.debug('[SignalFusion] Fusion complete', {
    direction,
    confidence,
    weightedScore,
    signalCount: signals.length,
  });

  return { direction, confidence, weightedScore, signals: clamped, reasoning };
}

// ── Adaptive weight update (self-learning EMA) ────────────────────────────────

/**
 * Update signal weights based on actual outcome (self-learning feedback loop).
 * Uses EMA: newWeight = 0.9 * oldWeight + 0.1 * (correct ? 1.2 : 0.8)
 *
 * A signal "predicted correctly" if its score sign matches the actual outcome direction.
 * NEUTRAL signals are not penalized or rewarded.
 *
 * Returns new SignalInput[] with updated weights (immutable — originals unchanged).
 */
export function updateWeights(
  signals: SignalInput[],
  actualOutcome: 'UP' | 'DOWN',
): SignalInput[] {
  return signals.map(signal => {
    // Determine if this signal called the right direction
    const predictedUp = signal.score > 0;
    const predictedDown = signal.score < 0;
    const isNeutral = signal.score === 0;

    let adjustment: number;
    if (isNeutral) {
      // Neutral signal: no update — preserve current weight
      adjustment = signal.weight;
    } else {
      const correct =
        (actualOutcome === 'UP' && predictedUp) ||
        (actualOutcome === 'DOWN' && predictedDown);

      const factor = correct ? CORRECT_BOOST : INCORRECT_DECAY;
      adjustment = EMA_DECAY * signal.weight + (1 - EMA_DECAY) * factor;
    }

    // Clamp weight to reasonable bounds to prevent runaway growth/collapse
    const newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, adjustment));

    logger.debug('[SignalFusion] Weight update', {
      signal: signal.name,
      oldWeight: signal.weight,
      newWeight,
      actualOutcome,
    });

    return { ...signal, weight: newWeight };
  });
}
