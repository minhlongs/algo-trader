import { describe, it, expect } from 'vitest';
import { calcSMA, calcStdDev, calcBands, isSqueezing, detectBreakout, createBollingerSqueezeTick } from '../bollinger-squeeze-v2';

describe('bollinger-squeeze-v2::calcSMA', () => {
  it('is a defined function', () => {
    expect(typeof calcSMA).toBe('function');
  });
});

describe('bollinger-squeeze-v2::calcStdDev', () => {
  it('is a defined function', () => {
    expect(typeof calcStdDev).toBe('function');
  });
});

describe('bollinger-squeeze-v2::calcBands', () => {
  it('is a defined function', () => {
    expect(typeof calcBands).toBe('function');
  });
});

describe('bollinger-squeeze-v2::isSqueezing', () => {
  it('is a defined function', () => {
    expect(typeof isSqueezing).toBe('function');
  });
});

describe('bollinger-squeeze-v2::detectBreakout', () => {
  it('is a defined function', () => {
    expect(typeof detectBreakout).toBe('function');
  });
});

describe('bollinger-squeeze-v2::createBollingerSqueezeTick', () => {
  it('is a defined function', () => {
    expect(typeof createBollingerSqueezeTick).toBe('function');
  });
});
