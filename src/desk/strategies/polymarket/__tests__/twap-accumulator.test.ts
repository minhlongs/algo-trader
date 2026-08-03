import { describe, it, expect } from 'vitest';
import { computeAverageEntryPrice, isSliceDue, getAccumulationDirection, createTwapAccumulatorTick } from '../twap-accumulator';

describe('twap-accumulator::computeAverageEntryPrice', () => {
  it('is a defined function', () => {
    expect(typeof computeAverageEntryPrice).toBe('function');
  });
});

describe('twap-accumulator::isSliceDue', () => {
  it('is a defined function', () => {
    expect(typeof isSliceDue).toBe('function');
  });
});

describe('twap-accumulator::getAccumulationDirection', () => {
  it('is a defined function', () => {
    expect(typeof getAccumulationDirection).toBe('function');
  });
});

describe('twap-accumulator::createTwapAccumulatorTick', () => {
  it('is a defined function', () => {
    expect(typeof createTwapAccumulatorTick).toBe('function');
  });
});
