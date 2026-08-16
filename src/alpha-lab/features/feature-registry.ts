/**
 * Feature Registry
 *
 * Maps feature names to their definitions and compute functions.
 * Rejects non-causal features from being registered.
 */

import type { CandleLike, FeatureDefinition, FeatureFn, FeatureVector } from './feature-types';
import { PRICE_FEATURES } from './price-features';
import { VOLUME_FEATURES } from './volume-features';

export const REGISTRY = new Map<string, { def: FeatureDefinition; compute: FeatureFn }>([
  ...Object.entries(PRICE_FEATURES),
  ...Object.entries(VOLUME_FEATURES),
]);

export function getFeature(name: string) {
  return REGISTRY.get(name);
}

export function listFeatures() {
  return Array.from(REGISTRY.values()).map((v) => v.def);
}

export function assertCausal(def: FeatureDefinition): void {
  if (!def.causal) {
    throw new Error(`Non-causal feature rejected: ${def.name}`);
  }
}

export function buildFeatureVector(
  market: string,
  timeframe: string,
  candles: Partial<CandleLike>[],
  names: string[],
): FeatureVector {
  const full = candles as unknown as CandleLike[];
  const features: Record<string, number | null> = {};
  const lastTs = candles[candles.length - 1]?.timestamp ?? timeframe;
  for (const name of names) {
    const entry = REGISTRY.get(name);
    if (!entry) {
      throw new Error(`Unknown feature: ${name}`);
    }
    assertCausal(entry.def);
    features[name] = entry.compute({ market, timeframe, candles: full });
  }
  return { timestamp: lastTs, market, timeframe, features };
}