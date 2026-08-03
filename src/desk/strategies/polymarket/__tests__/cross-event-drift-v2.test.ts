import { describe, it, expect } from 'vitest';
import { calcReturn, calcCorrelation, findLeaderLaggards, createCrossEventDriftTick } from '../cross-event-drift-v2';

describe('cross-event-drift-v2::calcReturn', () => {
  it('is a defined function', () => {
    expect(typeof calcReturn).toBe('function');
  });
});

describe('cross-event-drift-v2::calcCorrelation', () => {
  it('is a defined function', () => {
    expect(typeof calcCorrelation).toBe('function');
  });
});

describe('cross-event-drift-v2::findLeaderLaggards', () => {
  it('is a defined function', () => {
    expect(typeof findLeaderLaggards).toBe('function');
  });
});

describe('cross-event-drift-v2::createCrossEventDriftTick', () => {
  it('is a defined function', () => {
    expect(typeof createCrossEventDriftTick).toBe('function');
  });
});
