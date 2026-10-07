import { expect, test, describe } from 'vitest';
import { calculateCornishFisherVaR } from './cornish-fisher';

describe('calculateCornishFisherVaR', () => {
  test('returns 0 for insufficient data', () => {
    expect(calculateCornishFisherVaR([0.1, 0.2, 0.3], 1000, 0.95, 1)).toBe(0);
  });

  test('calculates a positive VaR for valid returns', () => {
    const returns = [-0.02, -0.01, 0, 0.01, 0.02];
    const pv = 10000;
    const varValue = calculateCornishFisherVaR(returns, pv, 0.95, 1);
    expect(varValue).toBeGreaterThan(0);
    expect(typeof varValue).toBe('number');
  });
});
