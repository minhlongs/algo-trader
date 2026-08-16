import { describe, it, expect } from 'vitest';
import { assertCausal, buildFeatureVector, listFeatures, getFeature, REGISTRY } from '../feature-registry';
import type { FeatureDefinition } from '../feature-types';

describe('FeatureRegistry', () => {
  it('lists all registered features', () => {
    const all = listFeatures();
    expect(all.length).toBeGreaterThan(0);
  });

  it('rejects non-causal features at registration', () => {
    expect(() => assertCausal({ name: 'x', timeframe: '1h', source: 'price', lookback: 1, causal: false, description: 'x' })).toThrow();
  });

  it('allows causal features', () => {
    expect(() => assertCausal({ name: 'x', timeframe: '1h', source: 'price', lookback: 1, causal: true, description: 'x' })).not.toThrow();
  });

  it('builds feature vector for known features', () => {
    const candles = [
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 50 },
      { timestamp: '2025-01-01T01:00:00Z', open: 101, high: 102, low: 100, close: 101, volume: 55 },
    ];
    const fv = buildFeatureVector('X', '1h', candles, ['simple_return', 'volume_zscore']);
    expect(fv.features.simple_return).not.toBeNull();
    expect(typeof fv.features.volume_zscore).toBe('number');
  });

  it('throws on unknown feature', () => {
    expect(() => buildFeatureVector('X', '1h', [], ['nonexistent'])).toThrow();
  });
});