import { describe, it, expect } from 'vitest';
import { estimateIV, computeVolRatio, getVolArbDirection, createVolatilitySurfaceArbTick } from '../volatility-surface-arb';

describe('volatility-surface-arb::estimateIV', () => {
  it('is a defined function', () => {
    expect(typeof estimateIV).toBe('function');
  });
});

describe('volatility-surface-arb::computeVolRatio', () => {
  it('is a defined function', () => {
    expect(typeof computeVolRatio).toBe('function');
  });
});

describe('volatility-surface-arb::getVolArbDirection', () => {
  it('is a defined function', () => {
    expect(typeof getVolArbDirection).toBe('function');
  });
});

describe('volatility-surface-arb::createVolatilitySurfaceArbTick', () => {
  it('is a defined function', () => {
    expect(typeof createVolatilitySurfaceArbTick).toBe('function');
  });
});
