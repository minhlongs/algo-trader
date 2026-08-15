/**
 * Meta-Learner: learns optimal signal weights from historical prediction accuracy.
 *
 * Reads resolved predictions from data/predictions.json (same store as
 * PredictionAccuracyTracker) and computes per-strategy EMA win-rates.
 * Exposed via getOptimalWeights() which returns normalised weights
 * with Wilson-score confidence intervals.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../shared/utils/logger';
import {
  DEFAULT_META_LEARNER_CONFIG,
  type MetaWeight,
  type MetaLearnerConfig,
  type StoredPrediction,
  type EmaCacheEntry,
} from './meta-learner-types';

// ── Config state ─────────────────────────────────────────────────────────────

let _config: MetaLearnerConfig = { ...DEFAULT_META_LEARNER_CONFIG };
let _emaCache: Map<string, EmaCacheEntry> | null = null;
let _lastLoadTimestamp = 0;

// ── Stats helpers ────────────────────────────────────────────────────────────

function wilsonLowerBound(successes: number, trials: number, z: number): number {
  if (trials === 0) return 0;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.max(0, (centre - spread) / denom);
}

function wilsonUpperBound(successes: number, trials: number, z: number): number {
  if (trials === 0) return 1;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.min(1, (centre + spread) / denom);
}

function zScore(alpha: number): number {
  if (alpha <= 0.01) return 2.576;
  if (alpha <= 0.05) return 1.96;
  if (alpha <= 0.10) return 1.645;
  return 1.96;
}

function computeEmaWinRate(
  resolved: StoredPrediction[],
  decay: number,
): { winRate: number; sampleSize: number } {
  if (resolved.length === 0) return { winRate: 0.5, sampleSize: 0 };
  let ema = resolved[0].correct ? 1.0 : 0.0;
  for (let i = 1; i < resolved.length; i++) {
    const indicator = resolved[i].correct ? 1.0 : 0.0;
    ema = decay * ema + (1 - decay) * indicator;
  }
  return { winRate: ema, sampleSize: resolved.length };
}

// ── File I/O ─────────────────────────────────────────────────────────────────

function predictionsFilePath(): string {
  return path.resolve(process.cwd(), 'data/predictions.json');
}

function loadPredictions(): StoredPrediction[] {
  const filePath = predictionsFilePath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  const cache = _emaCache!;

  const rawWeights = signalNames.map(name => {
    const cached = cache.get(name);
    if (cached && cached.sampleSize >= _config.minSamples) {
      const ciWidth = cached.ci[1] - cached.ci[0];
      const confidenceBoost = 1.0 + (1.0 - ciWidth) * 0.5;
      return {
        name, raw: cached.winRate * confidenceBoost,
        sampleSize: cached.sampleSize, ci: cached.ci, winRate: cached.winRate,
      };
    }
    return {
      name, raw: _config.fallbackWeight,
      sampleSize: cached?.sampleSize ?? 0,
      ci: ([0.0, 1.0] as [number, number]),
      winRate: cached?.winRate ?? 0.5,
    };
  });

  const clamped = rawWeights.map(r => ({
    ...r,
    raw: Math.max(_config.minWeight, Math.min(_config.maxWeight, r.raw)),
  }));

  const totalRaw = clamped.reduce((s, r) => s + r.raw, 0);
  if (totalRaw === 0) {
    const uniform = 1 / clamped.length;
    return clamped.map(r => ({
      name: r.name, weight: uniform, ci: r.ci,
      sampleSize: r.sampleSize, winRate: r.winRate,
    }));
  }

  return clamped.map(r => ({
    name: r.name, weight: r.raw / totalRaw, ci: r.ci,
    sampleSize: r.sampleSize, winRate: r.winRate,
  }));
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
