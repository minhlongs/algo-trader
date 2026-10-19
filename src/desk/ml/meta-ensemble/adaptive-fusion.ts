/**
 * Adaptive Fusion Engine
 *
 * Drop-in replacement for static fuseSignals that consults the MetaLearner
 * for data-driven weights. Falls back to caller-provided (or default) static
 * weights when the MetaLearner has insufficient historical data.
 *
 * Public API is intentionally compatible with the original fuseSignals signature
 * so callers can swap with minimal code change.
 *
 * Audit trail:
 *   Every fusion call logs the weight source (meta vs static) and the actual
 *   weights applied — emitted at debug level for non-intrusive monitoring.
 */

import {
  fuseSignals as staticFuse,
  adaptWeightsForRegime,
  type SignalInput,
  type FusionResult,
} from '../../intelligence/signal-fusion-engine';
import {
  getOptimalWeights,
  type MetaWeight,
} from './meta-learner';
import { logger } from '../../../shared/utils/logger';
import {
  buildFallbackMetaWeights,
  mergeSignalWeights,
  formatAppliedWeightLog,
} from './adaptive-fusion-math';

export {
  buildFallbackMetaWeights,
  mergeSignalWeights,
  formatAppliedWeightLog,
} from './adaptive-fusion-math';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdaptiveFusionOptions {
  /** Static fallback weights (keyed by signal name). Used when meta-learner has insufficient data. */
  fallbackWeights?: Record<string, number>;
  /** Market regime for regime-adaptive adjustment (optional). */
  regime?: string;
  /** Minimum number of resolved predictions per strategy before meta weights are trusted. */
  minMetaSamples?: number;
  /** If true, emit a one-shot warning per strategy that falls back to static. */
  warnOnFallback?: boolean;
}

export interface AdaptiveFusionResult extends FusionResult {
  /** Which weight source was used for each signal. */
  weightSource: Record<string, 'meta' | 'static'>;
  /** Raw MetaWeight details from the meta-learner (if available). */
  metaWeights?: MetaWeight[];
}

// ── Internal state ───────────────────────────────────────────────────────────

const _fallbackWarned = new Set<string>();

// ── Core logic ───────────────────────────────────────────────────────────────

/**
 * Fuse signals using meta-learned weights where available, static fallback otherwise.
 */
export function adaptiveFuse(
  signals: SignalInput[],
  options: AdaptiveFusionOptions = {},
): AdaptiveFusionResult {
  const {
    fallbackWeights = {},
    regime,
    minMetaSamples = 5,
    warnOnFallback = true,
  } = options;

  if (signals.length === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      weightedScore: 0,
      signals: [],
      reasoning: 'No signals provided',
      weightSource: {},
    };
  }

  const signalNames = signals.map((s) => s.name);
  let metaWeights: MetaWeight[];

  try {
    metaWeights = getOptimalWeights(signalNames);
  } catch (err) {
    logger.warn('[AdaptiveFusion] Meta-learner unavailable, falling back to static weights', { err });
    metaWeights = buildFallbackMetaWeights(signalNames, fallbackWeights);
  }

  const { fusedSignals, weightSource, fallbackNotices } = mergeSignalWeights(
    signals,
    metaWeights,
    fallbackWeights,
    minMetaSamples,
  );

  if (warnOnFallback) {
    for (const notice of fallbackNotices) {
      if (!_fallbackWarned.has(notice.signal)) {
        logger.info('[AdaptiveFusion] Using static fallback weight', notice);
        _fallbackWarned.add(notice.signal);
      }
    }
  }

  const regimeAdapted = regime
    ? adaptWeightsForRegime(fusedSignals, regime)
    : fusedSignals;

  const baseResult = staticFuse(regimeAdapted);

  logger.debug('[AdaptiveFusion] Weights applied', {
    direction: baseResult.direction,
    confidence: baseResult.confidence.toFixed(3),
    weights: formatAppliedWeightLog(regimeAdapted, weightSource),
    regime: regime ?? 'none',
  });

  return {
    ...baseResult,
    weightSource,
    metaWeights,
  };
}

/**
 * Reset internal warning state (useful in tests).
 */
export function resetAdaptiveFusionState(): void {
  _fallbackWarned.clear();
}
