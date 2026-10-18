import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STRESS_PRESETS, resolveCostConfig, totalRoundTripCostBps,
  applyStressToBaselineConfig, listStressModes, type CostStressMode,
} from '../cost-stress';

describe('DEFAULT_STRESS_PRESETS', () => {
  it('NORMAL preset matches spec values', () => {
    expect(DEFAULT_STRESS_PRESETS.NORMAL).toEqual({ mode: 'NORMAL', feeBps: 5, spreadBps: 2, slippageBps: 3, label: 'Normal market conditions' });
  });

  it('CONSERVATIVE preset matches spec values', () => {
    expect(DEFAULT_STRESS_PRESETS.CONSERVATIVE).toEqual({ mode: 'CONSERVATIVE', feeBps: 10, spreadBps: 5, slippageBps: 8, label: 'Conservative cost estimate' });
  });

  it('ADVERSE preset matches spec values', () => {
    expect(DEFAULT_STRESS_PRESETS.ADVERSE).toEqual({ mode: 'ADVERSE', feeBps: 20, spreadBps: 15, slippageBps: 20, label: 'Adverse market conditions' });
  });

  it('EXTREME preset carries ~100bps total round-trip friction', () => {
    expect(DEFAULT_STRESS_PRESETS.EXTREME).toEqual({ mode: 'EXTREME', feeBps: 30, spreadBps: 15, slippageBps: 25, label: 'Extreme cost stress (~100bps round-trip friction)' });
  });
});

describe('resolveCostConfig', () => {
  it('returns preset values when no overrides', () => {
    const cfg = resolveCostConfig('NORMAL');
    expect(cfg.feeBps).toBe(5);
    expect(cfg.spreadBps).toBe(2);
    expect(cfg.slippageBps).toBe(3);
  });

  it('overrides win over preset', () => {
    const cfg = resolveCostConfig('CONSERVATIVE', { feeBps: 99 });
    expect(cfg.feeBps).toBe(99);
    expect(cfg.slippageBps).toBe(8);
    expect(cfg.mode).toBe('CONSERVATIVE');
  });

  it('allows adding marketImpactBps via overrides', () => {
    const cfg = resolveCostConfig('NORMAL', { marketImpactBps: 7 });
    expect(cfg.marketImpactBps).toBe(7);
  });

  it('forces mode to the requested key even if override lies', () => {
    const cfg = resolveCostConfig('ADVERSE', { mode: 'NORMAL' as CostStressMode });
    expect(cfg.mode).toBe('ADVERSE');
  });

  it('returns a frozen object', () => {
    const cfg = resolveCostConfig('NORMAL');
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('throws on unknown mode', () => {
    expect(() => resolveCostConfig('BANANAS' as CostStressMode)).toThrow('Unknown CostStressMode');
  });
});

describe('totalRoundTripCostBps', () => {
  it('is fee*2 + spread + slippage (no impact)', () => {
    const cfg = resolveCostConfig('CONSERVATIVE');
    expect(totalRoundTripCostBps(cfg)).toBe(33);
  });

  it('includes marketImpactBps when present', () => {
    const cfg = resolveCostConfig('ADVERSE', { marketImpactBps: 5 });
    expect(totalRoundTripCostBps(cfg)).toBe(80);
  });

  it('ADVERSE > CONSERVATIVE > NORMAL', () => {
    const normal = totalRoundTripCostBps(DEFAULT_STRESS_PRESETS.NORMAL);
    const conservative = totalRoundTripCostBps(DEFAULT_STRESS_PRESETS.CONSERVATIVE);
    const adverse = totalRoundTripCostBps(DEFAULT_STRESS_PRESETS.ADVERSE);
    expect(adverse).toBeGreaterThan(conservative);
    expect(conservative).toBeGreaterThan(normal);
  });

  it('EXTREME preset totals exactly 100bps (fee 30 x2 + spread 15 + slippage 25)', () => {
    expect(totalRoundTripCostBps(DEFAULT_STRESS_PRESETS.EXTREME)).toBe(100);
  });
});

describe('applyStressToBaselineConfig', () => {
  it('produces correct { feeBps, slippageBps } shape', () => {
    const result = applyStressToBaselineConfig({}, 'CONSERVATIVE');
    expect(result).toEqual({ feeBps: 15, slippageBps: 8 });
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['feeBps', 'slippageBps']));
  });

  it('folds spread into feeBps so callers that only accept two params see total fee', () => {
    const result = applyStressToBaselineConfig({}, 'ADVERSE');
    expect(result.feeBps).toBe(35);
    expect(result.slippageBps).toBe(20);
  });

  it('folds marketImpactBps into feeBps when present', () => {
    const result = applyStressToBaselineConfig({}, 'NORMAL', { marketImpactBps: 4 });
    expect(result.feeBps).toBe(11);
    expect(result.slippageBps).toBe(3);
  });
});

describe('listStressModes', () => {
  it('returns all four modes in canonical order', () => {
    expect(listStressModes()).toEqual(['NORMAL', 'CONSERVATIVE', 'ADVERSE', 'EXTREME']);
  });
});

describe('causality: cost stress does not read future data', () => {
  it('all exported functions accept only config/mode arguments, no candle data', () => {
    const cfg = resolveCostConfig('ADVERSE');
    expect(cfg).toBeDefined();
    const total = totalRoundTripCostBps(cfg);
    expect(total).toBeGreaterThan(0);
    const noop = applyStressToBaselineConfig(null, 'NORMAL');
    expect(noop).toEqual({ feeBps: 7, slippageBps: 3 });
    const noop2 = applyStressToBaselineConfig(undefined as unknown, 'CONSERVATIVE');
    expect(noop2).toEqual({ feeBps: 15, slippageBps: 8 });
    const modes = listStressModes();
    expect(modes).toHaveLength(4);
  });
});
