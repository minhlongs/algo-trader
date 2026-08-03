import { describe, it, expect } from 'vitest';
import { calcPivotPoints, isNearLevel, detectBounce, findHLC, createPivotPointBounceTick } from '../pivot-point-bounce-v2';

describe('pivot-point-bounce-v2::calcPivotPoints', () => {
  it('is a defined function', () => {
    expect(typeof calcPivotPoints).toBe('function');
  });
});

describe('pivot-point-bounce-v2::isNearLevel', () => {
  it('is a defined function', () => {
    expect(typeof isNearLevel).toBe('function');
  });
});

describe('pivot-point-bounce-v2::detectBounce', () => {
  it('is a defined function', () => {
    expect(typeof detectBounce).toBe('function');
  });
});

describe('pivot-point-bounce-v2::findHLC', () => {
  it('is a defined function', () => {
    expect(typeof findHLC).toBe('function');
  });
});

describe('pivot-point-bounce-v2::createPivotPointBounceTick', () => {
  it('is a defined function', () => {
    expect(typeof createPivotPointBounceTick).toBe('function');
  });
});
