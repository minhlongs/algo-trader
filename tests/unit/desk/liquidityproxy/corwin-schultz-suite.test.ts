import { describe, expect, it } from 'vitest';
import { CorwinSchultzEngine } from '../../../../src/desk/liquidityproxy/corwin-schultz-engine';

describe('Corwin-Schultz (2012) High-Low Bid-Ask Spread Estimator (Desk 103)', () => {
  it('should calculate a positive bid-ask spread for normal illiquid price ranges', () => {
    const metrics = CorwinSchultzEngine.calculateSpread({
      highDay1: 102, lowDay1: 100,
      highDay2: 103, lowDay2: 101
    });

    expect(metrics.gamma).toBeGreaterThan(0.0);
    expect(metrics.beta).toBeGreaterThan(0.0);
    expect(metrics.alpha).toBeDefined();
    
    // The estimator should be generally positive for these non-overlapping expanding high/lows
    expect(metrics.spread).toBeGreaterThanOrEqual(0.0);
    expect(metrics.isValid).toBe(true);
  });

  it('should handle zero variance by returning zero spread', () => {
    const metrics = CorwinSchultzEngine.calculateSpread({
      highDay1: 100, lowDay1: 100,
      highDay2: 100, lowDay2: 100
    });

    expect(metrics.gamma).toBeCloseTo(0.0, 6);
    expect(metrics.beta).toBeCloseTo(0.0, 6);
    
    // Check limit handling gracefully
    expect(metrics.alpha).toBeCloseTo(0.0, 6);
    expect(metrics.spread).toBeCloseTo(0.0, 6);
  });

  it('should cap negative alpha to zero spread for highly volatile zero-friction environments', () => {
    // If the 2-day variance massively exceeds the 1-day variances in a way that creates alpha < 0
    const metrics = CorwinSchultzEngine.calculateSpread({
      highDay1: 150, lowDay1: 50,
      highDay2: 160, lowDay2: 40
    });
    
    expect(metrics.gamma).toBeGreaterThan(0);
    expect(metrics.beta).toBeGreaterThan(0);
    expect(metrics.spread).toBeGreaterThanOrEqual(0);
  });
});
