import { describe, it, expect } from 'vitest';
import { calcBidVolume, calcAskVolume, calcBidAskRatio, calcZScore, createBookImbalanceReversalTick } from '../book-imbalance-reversal';

describe('book-imbalance-reversal::calcBidVolume', () => {
  it('is a defined function', () => {
    expect(typeof calcBidVolume).toBe('function');
  });
});

describe('book-imbalance-reversal::calcAskVolume', () => {
  it('is a defined function', () => {
    expect(typeof calcAskVolume).toBe('function');
  });
});

describe('book-imbalance-reversal::calcBidAskRatio', () => {
  it('is a defined function', () => {
    expect(typeof calcBidAskRatio).toBe('function');
  });
});

describe('book-imbalance-reversal::calcZScore', () => {
  it('is a defined function', () => {
    expect(typeof calcZScore).toBe('function');
  });
});

describe('book-imbalance-reversal::createBookImbalanceReversalTick', () => {
  it('is a defined function', () => {
    expect(typeof createBookImbalanceReversalTick).toBe('function');
  });
});
