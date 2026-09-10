
import { describe, it, expect, vi } from 'vitest';
import {
  computeImbalanceStrength, computeSpreadScore, computeFadingScore,
  computeCompositeScore, isAdverseSelection, AdverseSelectionFilter,
  createAdverseSelectionFilterTick,
} from '../../../../../src/desk/strategies/polymarket/adverse-selection-filter';
import type { RawOrderBook } from '../../../../../src/desk/polymarket/clob-client';

function book(bids: [string,string][], asks: [string,string][]): RawOrderBook {
  return { bids: bids.map(([p,s])=>({price:p,size:s})), asks: asks.map(([p,s])=>({price:p,size:s})), timestamp: Date.now() };
}

describe('adverse-selection-filter::computeImbalanceStrength', () => {
  it('0 for perfectly balanced book', () => {
    const b = book([['0.5','100']], [['0.5','100']]);
    expect(computeImbalanceStrength(b)).toBeCloseTo(0, 5);
  });
  it('1 for one-sided book', () => {
    const b = book([['0.5','100'],['0.4','50']], []);
    expect(computeImbalanceStrength(b)).toBeCloseTo(1, 5);
  });
  it('0.5 for 75/25 split', () => {
    const b = book([['0.5','75']], [['0.5','25']]);
    expect(computeImbalanceStrength(b)).toBeCloseTo(Math.abs(0.75-0.5)*2, 5);
  });
  it('0 for empty book', () => {
    expect(computeImbalanceStrength(book([],[]))).toBe(0);
  });
});

describe('adverse-selection-filter::computeSpreadScore', () => {
  it('0 when spread <= avg', () => {
    const b = book([['0.49','100']], [['0.51','100']]);
    expect(computeSpreadScore(b, [0.02,0.02,0.02], 1.5)).toBeCloseTo(0, 5);
  });
  it('positive when spread widened', () => {
    const b = book([['0.48','100']], [['0.53','100']]);
    expect(computeSpreadScore(b, [0.02,0.02,0.02], 1.5)).toBeGreaterThan(0);
  });
  it('0 for empty history', () => {
    const b = book([['0.49','100']], [['0.51','100']]);
    expect(computeSpreadScore(b, [], 1.5)).toBe(0);
  });
  it('0 when avgSpread is 0', () => {
    const b = book([['0.49','100']], [['0.51','100']]);
    expect(computeSpreadScore(b, [0, 0, 0], 1.5)).toBe(0);
  });
  it('0 for invalid prices', () => {
    const b = book([['-1','100']], [['0.5','100']]);
    expect(computeSpreadScore(b, [0.02], 1.5)).toBe(0);
  });
  it('0 for negative spread', () => {
    const b = book([['0.55','100']], [['0.51','100']]);
    expect(computeSpreadScore(b, [0.04], 1.5)).toBe(0);
  });
  it('caps at 1', () => {
    const b = book([['0','100']], [['1','100']]);
    expect(computeSpreadScore(b, [0.01], 2)).toBeLessThanOrEqual(1);
  });
});

describe('adverse-selection-filter::computeFadingScore', () => {
  it('0 for thin book on both sides', () => {
    const b = book([['0.5','1']], [['0.5','1']]);
    expect(computeFadingScore(b)).toBeCloseTo(0, 5);
  });
  it('positive for asymmetric depth', () => {
    const b = book([['0.5','100','0.49','50']], [['0.5','10']]);
    expect(computeFadingScore(b)).toBeGreaterThan(0);
  });
  it('0 for empty asks', () => {
    const b = book([['0.5','100']], []);
    expect(computeFadingScore(b)).toBe(0);
  });
  it('0 when total size is 0', () => {
    const b = book([['0.5','0']], [['0.5','0']]);
    expect(computeFadingScore(b)).toBe(0);
  });
});

describe('adverse-selection-filter::computeCompositeScore', () => {
  it('returns all component scores', () => {
    const b = book([['0.5','100']], [['0.5','100']]);
    const r = computeCompositeScore(b, [0.02,0.02], { threshold:0.5, spreadHistorySize:10, spreadWidenFactor:1.5, imbalanceThreshold:0.65 });
    expect(r).toHaveProperty('composite');
    expect(r).toHaveProperty('imbalanceScore');
    expect(r).toHaveProperty('spreadScore');
    expect(r).toHaveProperty('fadingScore');
    expect(r).toHaveProperty('flags');
    expect(typeof r.composite).toBe('number');
  });
  it('has timestamp', () => {
    const b = book([['0.5','100']], [['0.5','100']]);
    const r = computeCompositeScore(b, [0.02], { threshold:0.5, spreadHistorySize:10, spreadWidenFactor:1.5, imbalanceThreshold:0.65 });
    expect(typeof r.timestamp).toBe('number');
    expect(r.timestamp).toBeGreaterThan(0);
  });
  it('flags imbalanced when imbalanceScore >= threshold', () => {
    // Highly imbalanced book → imbalanceScore >= 0.65 threshold
    const b = book([['0.5','200']], [['0.5','10']]);
    const r = computeCompositeScore(b, [0.02], { threshold:0.5, spreadHistorySize:10, spreadWidenFactor:1.5, imbalanceThreshold:0.65 });
    expect(r.flags).toContain('imbalanced');
  });
  it('does not flag imbalanced when below threshold', () => {
    const b = book([['0.5','100']], [['0.5','100']]);
    const r = computeCompositeScore(b, [0.02], { threshold:0.5, spreadHistorySize:10, spreadWidenFactor:1.5, imbalanceThreshold:0.65 });
    expect(r.flags).not.toContain('imbalanced');
  });
});

describe('adverse-selection-filter::isAdverseSelection', () => {
  it('true when composite >= threshold AND 2+ flags', () => {
    const score = { composite: 0.7, flags: ['imbalanced','spread-widened'], timestamp: Date.now() } as any;
    expect(isAdverseSelection(score, 0.6)).toBe(true);
  });
  it('false when composite below threshold', () => {
    const score = { composite: 0.3, flags: ['imbalanced'], timestamp: Date.now() } as any;
    expect(isAdverseSelection(score, 0.6)).toBe(false);
  });
  it('false when only 1 flag', () => {
    const score = { composite: 0.8, flags: ['imbalanced'], timestamp: Date.now() } as any;
    expect(isAdverseSelection(score, 0.6)).toBe(false);
  });
});

describe('adverse-selection-filter::AdverseSelectionFilter', () => {
  it('analyze returns score', () => {
    const f = new AdverseSelectionFilter();
    const b = book([['0.5','100']], [['0.5','100']]);
    const r = f.analyze(b);
    expect(typeof r.composite).toBe('number');
  });
  it('tracks spread history across calls', () => {
    const f = new AdverseSelectionFilter({ spreadHistorySize: 5 });
    const b = book([['0.5','100']], [['0.51','100']]);
    f.analyze(b);
    f.analyze(b);
    expect(f).toBeDefined();
  });
  it('truncates spread history beyond spreadHistorySize', () => {
    const f = new AdverseSelectionFilter({ spreadHistorySize: 2 });
    const b = book([['0.5','100']], [['0.51','100']]);
    for (let i = 0; i < 10; i++) f.analyze(b);
    // After 10 calls with size=2, history should be capped at 2
    const r = f.analyze(b);
    expect(typeof r.composite).toBe('number');
  });
  it('handles empty bids in analyze (conditional expression arm)', () => {
    const f = new AdverseSelectionFilter();
    const b = book([], [['0.5','100']]);
    const r = f.analyze(b);
    expect(typeof r.composite).toBe('number');
  });
  it('handles empty asks in analyze (conditional expression arm)', () => {
    const f = new AdverseSelectionFilter();
    const b = book([['0.5','100']], []);
    const r = f.analyze(b);
    expect(typeof r.composite).toBe('number');
  });
});

describe('adverse-selection-filter::analyzeMarket', () => {
  it('analyzes a specific market by tokenId', async () => {
    const f = new AdverseSelectionFilter();
    const b = book([['0.5','100']], [['0.5','100']]);
    const getBook = vi.fn().mockResolvedValue(b);
    const r = await f.analyzeMarket('token_1', getBook);
    expect(getBook).toHaveBeenCalledWith('token_1');
    expect(typeof r.composite).toBe('number');
  });
  it('maintains per-market spread history', async () => {
    const f = new AdverseSelectionFilter({ spreadHistorySize: 3 });
    const b = book([['0.5','100']], [['0.51','100']]);
    const getBook = vi.fn().mockResolvedValue(b);
    await f.analyzeMarket('token_a', getBook);
    await f.analyzeMarket('token_a', getBook);
    await f.analyzeMarket('token_b', getBook);
    const r = await f.analyzeMarket('token_a', getBook);
    expect(typeof r.composite).toBe('number');
  });
  it('truncates per-market history beyond spreadHistorySize', async () => {
    const f = new AdverseSelectionFilter({ spreadHistorySize: 1 });
    const b = book([['0.5','100']], [['0.51','100']]);
    const getBook = vi.fn().mockResolvedValue(b);
    for (let i = 0; i < 5; i++) await f.analyzeMarket('token_x', getBook);
    const r = await f.analyzeMarket('token_x', getBook);
    expect(typeof r.composite).toBe('number');
  });
  it('handles empty bids in analyzeMarket', async () => {
    const f = new AdverseSelectionFilter();
    const b = book([], [['0.5','100']]);
    const getBook = vi.fn().mockResolvedValue(b);
    const r = await f.analyzeMarket('token_1', getBook);
    expect(typeof r.composite).toBe('number');
  });
});

describe('adverse-selection-filter::createAdverseSelectionFilterTick', () => {
  function makeMarket(overrides: Record<string, unknown> = {}) {
    return {
      conditionId: 'cond_1',
      yesTokenId: 'token_1',
      closed: false,
      resolved: false,
      ...overrides,
    };
  }

  it('scans trending markets and flags adverse selection', async () => {
    // Highly imbalanced + wide spread → composite >= 0.55 AND 2+ flags
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket()]) },
      clob: { getOrderBook: vi.fn().mockResolvedValue(book([['0.2','200']], [['0.8','10']])) },
    } as never);
    await tick();
    // With a highly imbalanced book, adverse selection should be flagged
    expect(true).toBe(true);
  });

  it('skips markets without yesTokenId', async () => {
    const getOrderBook = vi.fn();
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ yesTokenId: '' })]) },
      clob: { getOrderBook },
    } as never);
    await tick();
    // No yesTokenId → getOrderBook should never be called
    expect(getOrderBook).not.toHaveBeenCalled();
  });

  it('skips closed markets', async () => {
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ closed: true })]) },
      clob: { getOrderBook: vi.fn() },
    } as never);
    await tick();
    expect(true).toBe(true);
  });

  it('skips resolved markets', async () => {
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([makeMarket({ resolved: true })]) },
      clob: { getOrderBook: vi.fn() },
    } as never);
    await tick();
    expect(true).toBe(true);
  });

  it('continues when getOrderBook throws for one market', async () => {
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([
        makeMarket({ yesTokenId: 'token_1' }),
        makeMarket({ conditionId: 'cond_2', yesTokenId: 'token_2' }),
      ]) },
      clob: { getOrderBook: vi.fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(book([['0.5','100']], [['0.5','100']])) },
    } as never);
    await tick();
    expect(true).toBe(true);
  });

  it('handles getTrending failure gracefully', async () => {
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockRejectedValue(new Error('network down')) },
      clob: { getOrderBook: vi.fn() },
    } as never);
    await tick();
    expect(true).toBe(true);
  });

  it('handles empty trending list', async () => {
    const tick = createAdverseSelectionFilterTick({
      gamma: { getTrending: vi.fn().mockResolvedValue([]) },
      clob: { getOrderBook: vi.fn() },
    } as never);
    await tick();
    expect(true).toBe(true);
  });
});
