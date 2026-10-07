import { expect, test, describe } from 'vitest';
import { calculateExpectedShortfall } from './expected-shortfall';

describe('calculateExpectedShortfall', () => {
  test('returns 0 for empty returns', () => {
    expect(calculateExpectedShortfall([], 1000, 0.95, 1)).toBe(0);
  });

  test('calculates a positive ES', () => {
    const returns = [-0.05, -0.04, -0.03, -0.02, 0.01];
    const pv = 10000;
    const es = calculateExpectedShortfall(returns, pv, 0.95, 1);
    expect(es).toBeGreaterThan(0);
    expect(typeof es).toBe('number');
  });
});
