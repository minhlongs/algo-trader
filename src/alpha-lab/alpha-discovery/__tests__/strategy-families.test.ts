/**
 * Strategy Family Tests — Phase 11
 */

import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, experimentFromFamily } from '../strategy-family-registry';
import { ALL_FAMILIES } from '../strategy-families';

describe('Strategy Families', () => {
  it('contains all four families', () => {
    expect(ALL_FAMILIES).toHaveLength(4);
    const ids = ALL_FAMILIES.map((f) => f.id);
    expect(ids).toContain('momentum-breakout');
    expect(ids).toContain('trend-following');
    expect(ids).toContain('mean-reversion');
    expect(ids).toContain('volatility-breakout');
  });

  it('each family has required fields', () => {
    for (const family of ALL_FAMILIES) {
      expect(family.id).toBeTruthy();
      expect(family.name).toBeTruthy();
      expect(family.description).toBeTruthy();
      expect(family.features.length).toBeGreaterThan(0);
      expect(family.entryRule).toBeTruthy();
      expect(family.exitRule).toBeTruthy();
      expect(Object.keys(family.defaultParams).length).toBeGreaterThan(0);
      expect(Object.keys(family.paramBounds).length).toBeGreaterThan(0);
    }
  });

  it('param bounds cover default params', () => {
    for (const family of ALL_FAMILIES) {
      for (const key of Object.keys(family.defaultParams)) {
        expect(family.paramBounds[key]).toBeDefined();
      }
    }
  });
});

describe('Strategy Family Registry', () => {
  const registry = createDefaultRegistry();

  it('returns correct family by id', () => {
    const mf = registry.get('momentum-breakout');
    expect(mf).toBeDefined();
    expect(mf?.name).toBe('Momentum Breakout');
  });

  it('returns undefined for unknown id', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('list returns all four families', () => {
    expect(registry.list()).toHaveLength(4);
  });

  it('byCategory filters correctly', () => {
    expect(registry.byCategory('momentum')).toHaveLength(2);
    expect(registry.byCategory('mean-reversion')).toHaveLength(1);
    expect(registry.byCategory('volatility')).toHaveLength(1);
  });
});

describe('Experiment From Family', () => {
  const registry = createDefaultRegistry();

  it('throws for unknown family id', () => {
    expect(() =>
      experimentFromFamily(registry, { familyId: 'nope', symbol: 'BTC/USDT', timeframe: '1h' }),
    ).toThrow();
  });

  it('uses default params when no overrides', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'momentum-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
    });
    expect(config.lookback).toBe(20);
    expect(config.tp).toBe(0.02);
    expect(config.sl).toBe(0.01);
  });

  it('applies param overrides correctly', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'momentum-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      paramOverrides: { breakoutLookback: 50 },
    });
    expect(config.lookback).toBe(50);
  });

  it('clamps out-of-range params to bounds', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'momentum-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      paramOverrides: { breakoutLookback: 9999 },
    });
    expect(config.lookback).toBe(100);
  });

  it('returns frozen config', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'momentum-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('sets symbol and timeframe correctly', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'trend-following',
      symbol: 'ETH/USDT',
      timeframe: '4h',
    });
    expect(config.symbol).toBe('ETH/USDT');
    expect(config.timeframe).toBe('4h');
    expect(config.features).toEqual(['closeSlope', 'realizedVol', 'volumeAbnormality']);
  });

  it('determinism: same options → same config', () => {
    const opts = {
      familyId: 'mean-reversion',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      paramOverrides: { zThreshold: 2.5 },
      seed: 123,
    } as const;
    const a = experimentFromFamily(registry, opts);
    const b = experimentFromFamily(registry, opts);
    // createdAt is a wall-clock stamp assigned per call — compare everything
    // else, then assert it exists so the field stays covered.
    const { createdAt: _aCreated, ...restA } = a;
    const { createdAt: _bCreated, ...restB } = b;
    expect(restA).toEqual(restB);
    expect(typeof a.createdAt).toBe('string');
    expect(typeof b.createdAt).toBe('string');
  });

  it('applies feeBps and slippageBps overrides', () => {
    const config = experimentFromFamily(registry, {
      familyId: 'momentum-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
      feeBps: 15,
      slippageBps: 8,
    });
    expect(config.cost.feeBps).toBe(15);
    expect(config.cost.slippageBps).toBe(8);
  });
});