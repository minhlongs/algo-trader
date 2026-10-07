import { expect, test, describe } from 'vitest';
import { calculateCornishFisherVaR } from '../src/desk/risk/cornish-fisher';

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

  test('returns 0 if standard deviation is zero', () => {
    expect(calculateCornishFisherVaR([0.1, 0.1, 0.1, 0.1], 1000, 0.95, 1)).toBe(0);
  });

  test('handles 99% confidence level', () => {
    const returns = [-0.02, -0.01, 0, 0.01, 0.02];
    const pv = 10000;
    const varValue = calculateCornishFisherVaR(returns, pv, 0.99, 1);
    expect(varValue).toBeGreaterThan(0);
  });
});
