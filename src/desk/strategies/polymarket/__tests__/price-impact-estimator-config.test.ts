import { describe, it, expect } from 'vitest';
import { simulatePriceImpact, calcImpactAsymmetry, determineSide, updateImpactEma, bestBidAsk } from '../price-impact-estimator-config';

describe('price-impact-estimator-config::simulatePriceImpact', () => {
  it('is a defined function', () => {
    expect(typeof simulatePriceImpact).toBe('function');
  });
});

describe('price-impact-estimator-config::calcImpactAsymmetry', () => {
  it('is a defined function', () => {
    expect(typeof calcImpactAsymmetry).toBe('function');
  });
});

describe('price-impact-estimator-config::determineSide', () => {
  it('is a defined function', () => {
    expect(typeof determineSide).toBe('function');
  });
});

describe('price-impact-estimator-config::updateImpactEma', () => {
  it('is a defined function', () => {
    expect(typeof updateImpactEma).toBe('function');
  });
});

describe('price-impact-estimator-config::bestBidAsk', () => {
  it('is a defined function', () => {
    expect(typeof bestBidAsk).toBe('function');
  });
});
