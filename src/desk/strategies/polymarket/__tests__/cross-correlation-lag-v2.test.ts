import { describe, it, expect } from 'vitest';
import { calcPearsonCorrelation, calcCrossCorrelation, findBestLag, predictMove, createCrossCorrelationLagTick } from '../cross-correlation-lag-v2';

describe('cross-correlation-lag-v2::calcPearsonCorrelation', () => {
  it('is a defined function', () => {
    expect(typeof calcPearsonCorrelation).toBe('function');
  });
});

describe('cross-correlation-lag-v2::calcCrossCorrelation', () => {
  it('is a defined function', () => {
    expect(typeof calcCrossCorrelation).toBe('function');
  });
});

describe('cross-correlation-lag-v2::findBestLag', () => {
  it('is a defined function', () => {
    expect(typeof findBestLag).toBe('function');
  });
});

describe('cross-correlation-lag-v2::predictMove', () => {
  it('is a defined function', () => {
    expect(typeof predictMove).toBe('function');
  });
});

describe('cross-correlation-lag-v2::createCrossCorrelationLagTick', () => {
  it('is a defined function', () => {
    expect(typeof createCrossCorrelationLagTick).toBe('function');
  });
});
