import { describe, it, expect } from 'vitest';
import { simulatePriceImpact, calcImpactAsymmetry, determineSide, updateImpactEma, createPriceImpactEstimatorTick } from '../price-impact-estimator';

describe('price-impact-estimator::simulatePriceImpact', () => {
  it('is a defined function', () => {
    expect(typeof simulatePriceImpact).toBe('function');
  });
});

describe('price-impact-estimator::calcImpactAsymmetry', () => {
  it('is a defined function', () => {
    expect(typeof calcImpactAsymmetry).toBe('function');
  });
});

describe('price-impact-estimator::determineSide', () => {
  it('is a defined function', () => {
    expect(typeof determineSide).toBe('function');
  });
});

describe('price-impact-estimator::updateImpactEma', () => {
  it('is a defined function', () => {
    expect(typeof updateImpactEma).toBe('function');
  });
});

describe('price-impact-estimator::createPriceImpactEstimatorTick', () => {
  it('is a defined function', () => {
    expect(typeof createPriceImpactEstimatorTick).toBe('function');
  });
});
