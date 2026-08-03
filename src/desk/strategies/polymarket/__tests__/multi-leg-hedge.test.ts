import { describe, it, expect } from 'vitest';
import { calcEventDeviation, findMostMispriced, calcHedgeSize, shouldEnterHedge, createMultiLegHedgeTick } from '../multi-leg-hedge';

describe('multi-leg-hedge::calcEventDeviation', () => {
  it('is a defined function', () => {
    expect(typeof calcEventDeviation).toBe('function');
  });
});

describe('multi-leg-hedge::findMostMispriced', () => {
  it('is a defined function', () => {
    expect(typeof findMostMispriced).toBe('function');
  });
});

describe('multi-leg-hedge::calcHedgeSize', () => {
  it('is a defined function', () => {
    expect(typeof calcHedgeSize).toBe('function');
  });
});

describe('multi-leg-hedge::shouldEnterHedge', () => {
  it('is a defined function', () => {
    expect(typeof shouldEnterHedge).toBe('function');
  });
});

describe('multi-leg-hedge::createMultiLegHedgeTick', () => {
  it('is a defined function', () => {
    expect(typeof createMultiLegHedgeTick).toBe('function');
  });
});
