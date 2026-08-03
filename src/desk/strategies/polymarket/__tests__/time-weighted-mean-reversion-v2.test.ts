import { describe, it, expect } from 'vitest';
import { calcRollingMean, calcRollingStd, calcZScore, getTimeWeight, isSignalActive, createTimeWeightedMeanReversionTick } from '../time-weighted-mean-reversion-v2';

describe('time-weighted-mean-reversion-v2::calcRollingMean', () => {
  it('is a defined function', () => {
    expect(typeof calcRollingMean).toBe('function');
  });
});

describe('time-weighted-mean-reversion-v2::calcRollingStd', () => {
  it('is a defined function', () => {
    expect(typeof calcRollingStd).toBe('function');
  });
});

describe('time-weighted-mean-reversion-v2::calcZScore', () => {
  it('is a defined function', () => {
    expect(typeof calcZScore).toBe('function');
  });
});

describe('time-weighted-mean-reversion-v2::getTimeWeight', () => {
  it('is a defined function', () => {
    expect(typeof getTimeWeight).toBe('function');
  });
});

describe('time-weighted-mean-reversion-v2::isSignalActive', () => {
  it('is a defined function', () => {
    expect(typeof isSignalActive).toBe('function');
  });
});

describe('time-weighted-mean-reversion-v2::createTimeWeightedMeanReversionTick', () => {
  it('is a defined function', () => {
    expect(typeof createTimeWeightedMeanReversionTick).toBe('function');
  });
});
