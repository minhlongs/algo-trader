import { describe, it, expect } from 'vitest';
import { calcSpread, calcSpreadDeviation, updateSpreadEma, determineCheapSide, isSpreadSignal, createSpreadMeanReversionTick } from '../spread-mean-reversion-v2';

describe('spread-mean-reversion-v2::calcSpread', () => {
  it('is a defined function', () => {
    expect(typeof calcSpread).toBe('function');
  });
});

describe('spread-mean-reversion-v2::calcSpreadDeviation', () => {
  it('is a defined function', () => {
    expect(typeof calcSpreadDeviation).toBe('function');
  });
});

describe('spread-mean-reversion-v2::updateSpreadEma', () => {
  it('is a defined function', () => {
    expect(typeof updateSpreadEma).toBe('function');
  });
});

describe('spread-mean-reversion-v2::determineCheapSide', () => {
  it('is a defined function', () => {
    expect(typeof determineCheapSide).toBe('function');
  });
});

describe('spread-mean-reversion-v2::isSpreadSignal', () => {
  it('is a defined function', () => {
    expect(typeof isSpreadSignal).toBe('function');
  });
});

describe('spread-mean-reversion-v2::createSpreadMeanReversionTick', () => {
  it('is a defined function', () => {
    expect(typeof createSpreadMeanReversionTick).toBe('function');
  });
});
