import { describe, it, expect } from 'vitest';
import { calcExpectedReturn, calcVariance, calcSharpeRatio, selectBestMarket, createMeanVarianceOptimizerTick } from '../mean-variance-optimizer-v2';

describe('mean-variance-optimizer-v2::calcExpectedReturn', () => {
  it('is a defined function', () => {
    expect(typeof calcExpectedReturn).toBe('function');
  });
});

describe('mean-variance-optimizer-v2::calcVariance', () => {
  it('is a defined function', () => {
    expect(typeof calcVariance).toBe('function');
  });
});

describe('mean-variance-optimizer-v2::calcSharpeRatio', () => {
  it('is a defined function', () => {
    expect(typeof calcSharpeRatio).toBe('function');
  });
});

describe('mean-variance-optimizer-v2::selectBestMarket', () => {
  it('is a defined function', () => {
    expect(typeof selectBestMarket).toBe('function');
  });
});

describe('mean-variance-optimizer-v2::createMeanVarianceOptimizerTick', () => {
  it('is a defined function', () => {
    expect(typeof createMeanVarianceOptimizerTick).toBe('function');
  });
});
