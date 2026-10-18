/**
 * Pure weight resolution and fallback math helpers for Adaptive Fusion Engine.
 */

import type { SignalInput } from '../../intelligence/signal-fusion-engine';
import type { MetaWeight } from './meta-learner';

export interface FallbackSignalNotice {
  signal: string;
  metaSampleSize: number;
  staticWeight: number;
}

export interface MergedSignalWeights {
  fusedSignals: SignalInput[];
  weightSource: Record<string, 'meta' | 'static'>;
  fallbackNotices: FallbackSignalNotice[];
}

/**
 * Build uniform/fallback MetaWeight array when meta-learner fails or throws.
 */
export function buildFallbackMetaWeights(
  signalNames: string[],
  fallbackWeights: Record<string, number>,
): MetaWeight[] {
  const defaultWeight = signalNames.length > 0 ? 1.0 / signalNames.length : 0;
  return signalNames.map((name) => ({
    name,
    weight: fallbackWeights[name] ?? defaultWeight,
    ci: [0, 1] as [number, number],
    sampleSize: 0,
    winRate: 0.5,
  }));
}

/**
 * Merge meta-learned weights with static fallback weights based on minimum sample threshold.
 */
export function mergeSignalWeights(
  signals: SignalInput[],
  metaWeights: MetaWeight[],
  fallbackWeights: Record<string, number>,
  minMetaSamples: number,
): MergedSignalWeights {
  const fusedSignals: SignalInput[] = [];
  const weightSource: Record<string, 'meta' | 'static'> = {};
  const fallbackNotices: FallbackSignalNotice[] = [];

  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const mw = metaWeights.find((w) => w.name === signal.name);

    if (mw && mw.sampleSize >= minMetaSamples) {
      fusedSignals.push({ ...signal, weight: mw.weight });
      weightSource[signal.name] = 'meta';
    } else {
      const staticW = fallbackWeights[signal.name] ?? signal.weight;
      fusedSignals.push({ ...signal, weight: staticW });
      weightSource[signal.name] = 'static';
      fallbackNotices.push({
        signal: signal.name,
        metaSampleSize: mw?.sampleSize ?? 0,
        staticWeight: staticW,
      });
    }
  }

  return { fusedSignals, weightSource, fallbackNotices };
}

/**
 * Format compact audit string of applied weights and their sources.
 */
export function formatAppliedWeightLog(
  signals: SignalInput[],
  weightSource: Record<string, 'meta' | 'static'>,
): string {
  return signals
    .map((s) => `${s.name}=${s.weight.toFixed(3)}(${weightSource[s.name]})`)
    .join(', ');
}
