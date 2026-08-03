import { describe, it, expect } from 'vitest';
import { calcMedianSize, detectWhaleOrders, calcWhaleImbalance, shouldEnter, createWhaleTrackerTick } from '../whale-tracker-v2';

describe('whale-tracker-v2::calcMedianSize', () => {
  it('is a defined function', () => {
    expect(typeof calcMedianSize).toBe('function');
  });
});

describe('whale-tracker-v2::detectWhaleOrders', () => {
  it('is a defined function', () => {
    expect(typeof detectWhaleOrders).toBe('function');
  });
});

describe('whale-tracker-v2::calcWhaleImbalance', () => {
  it('is a defined function', () => {
    expect(typeof calcWhaleImbalance).toBe('function');
  });
});

describe('whale-tracker-v2::shouldEnter', () => {
  it('is a defined function', () => {
    expect(typeof shouldEnter).toBe('function');
  });
});

describe('whale-tracker-v2::createWhaleTrackerTick', () => {
  it('is a defined function', () => {
    expect(typeof createWhaleTrackerTick).toBe('function');
  });
});
