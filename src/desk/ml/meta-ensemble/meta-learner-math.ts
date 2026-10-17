/**
 * Meta-Learner Statistical & Ensemble Weight Math Helpers
 * Extracted from meta-learner.ts for pure Wilson-score CI, EMA win-rate, and weight normalization.
 */

import type {
  MetaWeight,
  MetaLearnerConfig,
  StoredPrediction,
  EmaCacheEntry,
} from './meta-learner-types';

export function wilsonLowerBound(successes: number, trials: number, z: number): number {
  if (trials === 0) return 0;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.max(0, (centre - spread) / denom);
}

export function wilsonUpperBound(successes: number, trials: number, z: number): number {
  if (trials === 0) return 1;
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.min(1, (centre + spread) / denom);
}

export function zScore(alpha: number): number {
  if (alpha <= 0.01) return 2.576;
  if (alpha <= 0.05) return 1.96;
  if (alpha <= 0.10) return 1.645;
  return 1.96;
}

export function computeEmaWinRate(
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

export function computeNormalizedMetaWeights(
  signalNames: string[],
  cache: Map<string, EmaCacheEntry>,
  config: MetaLearnerConfig,
): MetaWeight[] {
  if (signalNames.length === 0) return [];

  const rawWeights = signalNames.map(name => {
    const cached = cache.get(name);
    if (cached && cached.sampleSize >= config.minSamples) {
      const ciWidth = cached.ci[1] - cached.ci[0];
      const confidenceBoost = 1.0 + (1.0 - ciWidth) * 0.5;
      return {
        name,
        raw: cached.winRate * confidenceBoost,
        sampleSize: cached.sampleSize,
        ci: cached.ci,
        winRate: cached.winRate,
      };
    }
    return {
      name,
      raw: config.fallbackWeight,
      sampleSize: cached?.sampleSize ?? 0,
      ci: [0.0, 1.0] as [number, number],
      winRate: cached?.winRate ?? 0.5,
    };
  });

  const clamped = rawWeights.map(r => ({
    ...r,
    raw: Math.max(config.minWeight, Math.min(config.maxWeight, r.raw)),
  }));

  const totalRaw = clamped.reduce((s, r) => s + r.raw, 0);
  if (totalRaw === 0) {
    const uniform = 1 / clamped.length;
    return clamped.map(r => ({
      name: r.name,
      weight: uniform,
      ci: r.ci,
      sampleSize: r.sampleSize,
      winRate: r.winRate,
    }));
  }

  return clamped.map(r => ({
    name: r.name,
    weight: r.raw / totalRaw,
    ci: r.ci,
    sampleSize: r.sampleSize,
    winRate: r.winRate,
  }));
}
