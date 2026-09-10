import { describe, it, expect } from 'vitest';
import {
  REGISTRY,
  getFeature,
  listFeatures,
  assertCausal,
  buildFeatureVector,
} from '../feature-registry';
import type { FeatureDefinition } from '../feature-types';

describe('feature-registry', () => {
  it('registers price and volume features in REGISTRY', () => {
    expect(REGISTRY.size).toBeGreaterThan(0);
    expect(REGISTRY.has('momentum')).toBe(true);
    expect(REGISTRY.has('simple_return')).toBe(true);
    expect(REGISTRY.has('volume_zscore')).toBe(true);
  });

  it('retrieves feature via getFeature', () => {
    const feat = getFeature('momentum');
    expect(feat).toBeDefined();
    expect(feat!.def.name).toBe('momentum');
    expect(feat!.def.causal).toBe(true);

    const nonExistent = getFeature('non_existent_feature_xyz');
    expect(nonExistent).toBeUndefined();
  });

  it('lists all registered feature definitions via listFeatures', () => {
    const list = listFeatures();
    expect(list.length).toBe(REGISTRY.size);
    expect(list.every((def) => typeof def.name === 'string')).toBe(true);
  });

  it('assertCausal accepts causal features and throws for non-causal features', () => {
    const causalDef: FeatureDefinition = {
      name: 'causal_test',
      description: 'Test causal feature',
      causal: true,
      minBarsRequired: 10,
    };
    expect(() => assertCausal(causalDef)).not.toThrow();

    const nonCausalDef: FeatureDefinition = {
      name: 'non_causal_test',
      description: 'Test non-causal feature',
      causal: false,
      minBarsRequired: 10,
    };
    expect(() => assertCausal(nonCausalDef)).toThrow('Non-causal feature rejected: non_causal_test');
  });

  it('builds feature vector for valid features', () => {
    const candles = Array.from({ length: 30 }, (_, i) => ({
      timestamp: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 101 + i,
      volume: 1000 + i * 10,
    }));

    const vector = buildFeatureVector('BTC/USDT', '1h', candles, ['momentum', 'volume_zscore']);
    expect(vector.market).toBe('BTC/USDT');
    expect(vector.timeframe).toBe('1h');
    expect(vector.timestamp).toBe(candles[candles.length - 1]!.timestamp);
    expect(vector.features['momentum']).toBeDefined();
    expect(vector.features['volume_zscore']).toBeDefined();
  });

  it('falls back to timeframe when candles array is empty in buildFeatureVector', () => {
    const vector = buildFeatureVector('ETH/USDT', '15m', [], []);
    expect(vector.timestamp).toBe('15m');
    expect(vector.features).toEqual({});
  });

  it('throws error when unknown feature is requested in buildFeatureVector', () => {
    expect(() =>
      buildFeatureVector('BTC/USDT', '1h', [], ['unknown_feature_xyz']),
    ).toThrow('Unknown feature: unknown_feature_xyz');
  });
});
