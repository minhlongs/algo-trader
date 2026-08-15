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
 *
 * Behaviour:
 *   1. Query meta-learner for optimal weights for all signal names.
 *   2. For each signal, if meta-learner returned sufficient sample size → use meta weight.
 *   3. Otherwise, use the static weight from the signal input or fallbackWeights map.
 *   4. Apply regime adaptation if regime is provided.
 *   5. Delegate to the existing fuseSignals for final weighted fusion.
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

  const signalNames = signals.map(s => s.name);

  // Attempt to get meta-learner weights (may return fallback if insufficient data)
  let metaWeights: MetaWeight[];
  let metaAvailable = false;

  try {
    metaWeights = getOptimalWeights(signalNames);
    // Check if meta-learner actually has data for any signal
    metaAvailable = metaWeights.some(mw => mw.sampleSize >= minMetaSamples);
  } catch (err) {
    logger.warn('[AdaptiveFusion] Meta-learner unavailable, falling back to static weights', { err });
    metaWeights = signalNames.map(name => ({
      name,
      weight: fallbackWeights[name] ?? 1.0 / signalNames.length,
      ci: [0, 1] as [number, number],
      sampleSize: 0,
      winRate: 0.5,
    }));
  }

  // Build weight source map and merge meta+static weights
  const fusedSignals: SignalInput[] = [];
  const weightSource: Record<string, 'meta' | 'static'> = {};

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const mw = metaWeights.find(w => w.name === signal.name);

    if (mw && mw.sampleSize >= minMetaSamples) {
      // Meta-learner has enough data — use its weight
      fusedSignals.push({ ...signal, weight: mw.weight });
      weightSource[signal.name] = 'meta';
    } else {
      // Fallback: use static weight from fallback map, or signal's own weight
      const staticW = fallbackWeights[signal.name] ?? signal.weight;
      fusedSignals.push({ ...signal, weight: staticW });
      weightSource[signal.name] = 'static';

      if (warnOnFallback && !_fallbackWarned.has(signal.name)) {
        logger.info('[AdaptiveFusion] Using static fallback weight', {
          signal: signal.name,
          metaSampleSize: mw?.sampleSize ?? 0,
          staticWeight: staticW,
        });
        _fallbackWarned.add(signal.name);
      }
    }
  }

  // Apply regime adaptation if provided
  const regimeAdapted = regime
    ? adaptWeightsForRegime(fusedSignals, regime)
    : fusedSignals;

  // Delegate final fusion to the proven static engine
  const baseResult = staticFuse(regimeAdapted);

  // Audit log at debug level
  const weightLog = regimeAdapted
    .map(s => `${s.name}=${s.weight.toFixed(3)}(${weightSource[s.name]})`)
    .join(', ');
  logger.debug('[AdaptiveFusion] Weights applied', {
    direction: baseResult.direction,
    confidence: baseResult.confidence.toFixed(3),
    weights: weightLog,
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
