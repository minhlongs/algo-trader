/**
 * Strategy Family Tests — Phase 11
 */

import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, createRegistry, experimentFromFamily } from '../../../../src/alpha-lab/alpha-discovery/strategy-family-registry';
import { ALL_FAMILIES } from '../../../../src/alpha-lab/alpha-discovery/strategy-families';
import type { StrategyFamily } from '../../../../src/alpha-lab/alpha-discovery/strategy-family-types';

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

  it('derives tp, sl, maxHolding, lookback, and regimes from family params and options', () => {
    const trendConfig = experimentFromFamily(registry, {
      familyId: 'trend-following',
      symbol: 'SOL/USDT',
      timeframe: '1h',
      regimes: ['TREND_UP'],
    });
    expect(trendConfig.tp).toBe(0.03); // 300 bps
    expect(trendConfig.sl).toBe(0.015); // 150 bps
    expect(trendConfig.regimes).toEqual(['TREND_UP']);
    expect(trendConfig.seed).toBe(42);

    const mrConfig = experimentFromFamily(registry, {
      familyId: 'mean-reversion',
      symbol: 'BTC/USDT',
      timeframe: '1h',
    });
    expect(mrConfig.maxHolding).toBe(48); // maxHoldBars

    const volConfig = experimentFromFamily(registry, {
      familyId: 'volatility-breakout',
      symbol: 'BTC/USDT',
      timeframe: '1h',
    });
    expect(volConfig.lookback).toBe(14); // atrLookback
  });

  it('falls back when family lacks specific bounds or parameter keys', () => {
    const unconstrainedFamily: StrategyFamily = {
      id: 'unconstrained',
      name: 'Unconstrained Strategy',
      description: 'Test family with missing bounds and fallback parameters',
      category: 'momentum',
      features: ['returns'],
      entryRule: 'true',
      exitRule: 'false',
      positionSizing: 'fixed-fraction',
      defaultParams: {
        freeParam: 99,
      },
      paramBounds: {},
    };

    const customRegistry = createRegistry([unconstrainedFamily]);
    const config = experimentFromFamily(customRegistry, {
      familyId: 'unconstrained',
      symbol: 'ETH/USDT',
      timeframe: '15m',
      paramOverrides: { freeParam: 123 },
    });

    expect(config.tp).toBe(0.02); // fallback tp
    expect(config.sl).toBe(0.01); // fallback sl
    expect(config.maxHolding).toBe(24); // fallback maxHolding
    expect(config.lookback).toBe(20); // fallback lookback
    expect(config.regimes).toBe('all');
  });
});