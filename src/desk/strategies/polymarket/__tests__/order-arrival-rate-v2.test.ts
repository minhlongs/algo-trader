import { describe, it, expect } from 'vitest';
import { countNewLevels, calcArrivalAsymmetry, isSignalActive, extractPriceLevels, createOrderArrivalRateTick } from '../order-arrival-rate-v2';

describe('order-arrival-rate-v2::countNewLevels', () => {
  it('is a defined function', () => {
    expect(typeof countNewLevels).toBe('function');
  });
});

describe('order-arrival-rate-v2::calcArrivalAsymmetry', () => {
  it('is a defined function', () => {
    expect(typeof calcArrivalAsymmetry).toBe('function');
  });
});

describe('order-arrival-rate-v2::isSignalActive', () => {
  it('is a defined function', () => {
    expect(typeof isSignalActive).toBe('function');
  });
});

describe('order-arrival-rate-v2::extractPriceLevels', () => {
  it('is a defined function', () => {
    expect(typeof extractPriceLevels).toBe('function');
  });
});

describe('order-arrival-rate-v2::createOrderArrivalRateTick', () => {
  it('is a defined function', () => {
    expect(typeof createOrderArrivalRateTick).toBe('function');
  });
});
