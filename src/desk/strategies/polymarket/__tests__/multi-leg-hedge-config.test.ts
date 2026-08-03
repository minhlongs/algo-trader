
import { describe, it, expect } from 'vitest';
import {
  calcEventDeviation, findMostMispriced, calcHedgeSize, shouldEnterHedge, DEFAULT_CONFIG,
} from '../multi-leg-hedge-config';

describe('multi-leg-hedge-config::calcEventDeviation', () => {
  it('0 for empty prices', () => {
    expect(calcEventDeviation([])).toBe(0);
  });
  it('returns sum-1', () => {
    expect(calcEventDeviation([0.4, 0.35, 0.3])).toBeCloseTo(0.05, 5);
  });
  it('overpriced event returns positive', () => {
    expect(calcEventDeviation([0.6, 0.6])).toBeCloseTo(0.2, 5);
  });
  it('underpriced event returns negative', () => {
    expect(calcEventDeviation([0.3, 0.3])).toBeCloseTo(-0.4, 5);
  });
  it('exactly fair sum=1 returns 0', () => {
    expect(calcEventDeviation([0.5, 0.5])).toBeCloseTo(0, 5);
  });
});

describe('multi-leg-hedge-config::findMostMispriced', () => {
  it('returns most deviated from fair value', () => {
    const markets = [{ id: 'a', yesPrice: 0.9 }, { id: 'b', yesPrice: 0.1 }];
    const result = findMostMispriced(markets);
    expect(result.id).toBe('a');
    expect(result.rank).toBe(0);
  });
  it('tie-break preserves first occurrence', () => {
    const markets = [{ id: 'a', yesPrice: 0.9 }, { id: 'b', yesPrice: 0.9 }];
    const result = findMostMispriced(markets);
    expect(result.id).toBe('a');
  });
  it('returns empty for empty input', () => {
    const result = findMostMispriced([]);
    expect(result.id).toBe('');
    expect(result.rank).toBe(-1);
  });
});

describe('multi-leg-hedge-config::calcHedgeSize', () => {
  it('scaled size when deviation < threshold', () => {
    // scale = |0.02|/0.05 = 0.4 -> min(25*0.4, 25) = 10
    expect(calcHedgeSize(25, 0.02, 0.05)).toBeCloseTo(10, 5);
  });
  it('caps at baseSize when deviation >= threshold', () => {
    // scale = 0.1/0.05 = 2 -> min(50, 25) = 25
    expect(calcHedgeSize(25, 0.1, 0.05)).toBeCloseTo(25, 5);
  });
  it('returns baseSize for zero threshold', () => {
    expect(calcHedgeSize(25, 0.5, 0)).toBe(25);
  });
});

describe('multi-leg-hedge-config::shouldEnterHedge', () => {
  it('returns overpriced above threshold', () => {
    expect(shouldEnterHedge(0.1, DEFAULT_CONFIG)).toBe('overpriced');
  });
  it('returns underpriced below -threshold', () => {
    expect(shouldEnterHedge(-0.1, DEFAULT_CONFIG)).toBe('underpriced');
  });
  it('returns null within threshold', () => {
    expect(shouldEnterHedge(0.02, DEFAULT_CONFIG)).toBeNull();
  });
});

describe('multi-leg-hedge-config::DEFAULT_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_CONFIG.deviationThreshold).toBe(0.05);
    expect(DEFAULT_CONFIG.convergenceThreshold).toBe(0.02);
    expect(DEFAULT_CONFIG.maxPositions).toBe(4);
    expect(DEFAULT_CONFIG.positionSize).toBe('25');
  });
});
