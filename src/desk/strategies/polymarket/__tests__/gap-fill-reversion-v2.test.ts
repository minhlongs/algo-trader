import { describe, it, expect } from 'vitest';
import { detectGap, isGapConfirmed, isGapStale, calcFillTarget, createGapFillReversionTick } from '../gap-fill-reversion-v2';

describe('gap-fill-reversion-v2::detectGap', () => {
  it('is a defined function', () => {
    expect(typeof detectGap).toBe('function');
  });
});

describe('gap-fill-reversion-v2::isGapConfirmed', () => {
  it('is a defined function', () => {
    expect(typeof isGapConfirmed).toBe('function');
  });
});

describe('gap-fill-reversion-v2::isGapStale', () => {
  it('is a defined function', () => {
    expect(typeof isGapStale).toBe('function');
  });
});

describe('gap-fill-reversion-v2::calcFillTarget', () => {
  it('is a defined function', () => {
    expect(typeof calcFillTarget).toBe('function');
  });
});

describe('gap-fill-reversion-v2::createGapFillReversionTick', () => {
  it('is a defined function', () => {
    expect(typeof createGapFillReversionTick).toBe('function');
  });
});
