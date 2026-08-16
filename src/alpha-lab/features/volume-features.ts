/**
 * Volume Features
 *
 * Volume z-score, relative volume, volume momentum.
 */

import type { FeatureContext, FeatureDefinition, FeatureFn } from './feature-types';

export const volumeZScore: FeatureDefinition = {
  name: 'volume_zscore',
  timeframe: 'any',
  source: 'volume',
  lookback: 20,
  causal: true,
  description: '(volume_t - mean(volume)) / std(volume) over lookback',
};

export const relativeVolume: FeatureDefinition = {
  name: 'relative_volume',
  timeframe: 'any',
  source: 'volume',
  lookback: 20,
  causal: true,
  description: 'volume_t / mean(volume over lookback)',
};

export const volumeMomentum: FeatureDefinition = {
  name: 'volume_momentum',
  timeframe: 'any',
  source: 'volume',
  lookback: 10,
  causal: true,
  description: '(volume_t - volume_{t-lookback}) / volume_{t-lookback}',
};

export function computeVolumeZScore(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const vols = ctx.candles.map((c) => c.volume);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  const std = Math.sqrt(vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length);
  if (std === 0) return 0;
  return (ctx.candles[ctx.candles.length - 1]!.volume - mean) / std;
}

export function computeRelativeVolume(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const vols = ctx.candles.map((c) => c.volume);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  if (mean <= 0) return null;
  return ctx.candles[ctx.candles.length - 1]!.volume / mean;
}

export function computeVolumeMomentum(ctx: FeatureContext): number | null {
  if (ctx.candles.length < 2) return null;
  const window = ctx.candles.slice(-ctx.candles.length);
  const prev = window[0]!.volume;
  const curr = window[window.length - 1]!.volume;
  if (prev <= 0 || curr <= 0) return null;
  return (curr - prev) / prev;
}

export const VOLUME_FEATURES: Record<string, { def: FeatureDefinition; compute: FeatureFn }> = {
  volume_zscore: { def: volumeZScore, compute: computeVolumeZScore },
  relative_volume: { def: relativeVolume, compute: computeRelativeVolume },
  volume_momentum: { def: volumeMomentum, compute: computeVolumeMomentum },
};