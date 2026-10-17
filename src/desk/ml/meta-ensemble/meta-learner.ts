/**
 * Meta-Learner: learns optimal signal weights from historical prediction accuracy.
 *
 * Reads resolved predictions from data/predictions.json (same store as
 * PredictionAccuracyTracker) and computes per-strategy EMA win-rates.
 * Exposed via getOptimalWeights() which returns normalised weights
 * with Wilson-score confidence intervals.
 */

import * as path from 'path';
import { logger } from '../../../shared/utils/logger';
import { readJson } from '../../../shared/persistence/persistent-store';
import {
  DEFAULT_META_LEARNER_CONFIG,
  type MetaWeight,
  type MetaLearnerConfig,
  type StoredPrediction,
  type EmaCacheEntry,
} from './meta-learner-types';
import {
  wilsonLowerBound,
  wilsonUpperBound,
  zScore,
  computeEmaWinRate,
  computeNormalizedMetaWeights,
} from './meta-learner-math';

export {
  wilsonLowerBound,
  wilsonUpperBound,
  zScore,
  computeEmaWinRate,
  computeNormalizedMetaWeights,
};

// ── Config state ─────────────────────────────────────────────────────────────

let _config: MetaLearnerConfig = { ...DEFAULT_META_LEARNER_CONFIG };
let _emaCache: Map<string, EmaCacheEntry> | null = null;
let _lastLoadTimestamp = 0;

// ── File I/O ─────────────────────────────────────────────────────────────────

function predictionsFilePath(): string {
  return path.resolve(process.cwd(), 'data/predictions.json');
}

function loadPredictions(): StoredPrediction[] {
  const result = readJson<StoredPrediction[]>(predictionsFilePath());
  if (Array.isArray(result)) return result;
  return [];
}

// ── Public API ───────────────────────────────────────────────────────────────

export type { MetaWeight, MetaLearnerConfig };

export function configureMetaLearner(partial: Partial<MetaLearnerConfig>): void {
  _config = { ...DEFAULT_META_LEARNER_CONFIG, ...partial };
  _emaCache = null;
  logger.debug('[MetaLearner] Configuration updated', _config);
}

export function refreshCache(): void {
  const predictions = loadPredictions();
  const resolved = predictions
    .filter(p => p.actualOutcome !== null && p.correct !== null)
    .sort((a, b) => a.predictedAt - b.predictedAt)
    .slice(-_config.lookback);

  const byStrategy = new Map<string, StoredPrediction[]>();
  for (const p of resolved) {
    const existing = byStrategy.get(p.strategy) ?? [];
    existing.push(p);
    byStrategy.set(p.strategy, existing);
  }

  _emaCache = new Map();
  const z = zScore(_config.ciAlpha);
  for (const [strategy, preds] of byStrategy) {
    const { winRate, sampleSize } = computeEmaWinRate(preds, _config.emaDecay);
    const correctCount = preds.filter(p => p.correct).length;
    const ci: [number, number] = [
      wilsonLowerBound(correctCount, sampleSize, z),
      wilsonUpperBound(correctCount, sampleSize, z),
    ];
    _emaCache.set(strategy, { winRate, sampleSize, ci });
  }
  _lastLoadTimestamp = Date.now();
  logger.debug('[MetaLearner] Cache refreshed', {
    strategies: Array.from(_emaCache.keys()),
    totalResolved: resolved.length,
  });
}

export function getOptimalWeights(
  signalNames: string[],
  lookbackOverride?: number,
): MetaWeight[] {
  if (!_emaCache || Date.now() - _lastLoadTimestamp > 30_000) {
    if (lookbackOverride !== undefined) {
      configureMetaLearner({ lookback: lookbackOverride });
    }
    refreshCache();
  }

  if (signalNames.length === 0) return [];
  return computeNormalizedMetaWeights(signalNames, _emaCache!, _config);
}

export function getMetaStats(): Record<string, EmaCacheEntry> {
  if (!_emaCache) refreshCache();
  const result: Record<string, EmaCacheEntry> = {};
  const cache = _emaCache ?? new Map();
  for (const [k, v] of cache) {
    result[k] = { ...v };
  }
  return result;
}
