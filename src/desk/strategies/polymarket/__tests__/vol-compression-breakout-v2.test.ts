import { describe, it, expect } from 'vitest';
import { calcRealizedVol, calcATR, detectCompression, detectBreakout, createVolCompressionBreakoutTick } from '../vol-compression-breakout-v2';

describe('vol-compression-breakout-v2::calcRealizedVol', () => {
  it('is a defined function', () => {
    expect(typeof calcRealizedVol).toBe('function');
  });
});

describe('vol-compression-breakout-v2::calcATR', () => {
  it('is a defined function', () => {
    expect(typeof calcATR).toBe('function');
  });
});

describe('vol-compression-breakout-v2::detectCompression', () => {
  it('is a defined function', () => {
    expect(typeof detectCompression).toBe('function');
  });
});

describe('vol-compression-breakout-v2::detectBreakout', () => {
  it('is a defined function', () => {
    expect(typeof detectBreakout).toBe('function');
  });
});

describe('vol-compression-breakout-v2::createVolCompressionBreakoutTick', () => {
  it('is a defined function', () => {
    expect(typeof createVolCompressionBreakoutTick).toBe('function');
  });
});
