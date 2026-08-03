import { describe, it, expect } from 'vitest';
import { computeSmartOBI, getTrendDirection, detectDivergence, createSmartMoneyDivergenceTick } from '../smart-money-divergence';

describe('smart-money-divergence::computeSmartOBI', () => {
  it('is a defined function', () => {
    expect(typeof computeSmartOBI).toBe('function');
  });
});

describe('smart-money-divergence::getTrendDirection', () => {
  it('is a defined function', () => {
    expect(typeof getTrendDirection).toBe('function');
  });
});

describe('smart-money-divergence::detectDivergence', () => {
  it('is a defined function', () => {
    expect(typeof detectDivergence).toBe('function');
  });
});

describe('smart-money-divergence::createSmartMoneyDivergenceTick', () => {
  it('is a defined function', () => {
    expect(typeof createSmartMoneyDivergenceTick).toBe('function');
  });
});
