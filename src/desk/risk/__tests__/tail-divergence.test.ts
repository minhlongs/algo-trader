import { describe, expect, it } from 'vitest';
import { computeTailDivergence, TailDivergenceDetector } from '../tail-divergence';

describe('tail-divergence Tail Risk Divergence Ratio detector', () => {
  it('calculates ratio of historical CVaR to parametric CVaR accurately', () => {
    const res = computeTailDivergence(2000, 3200);
    expect(res.ratio).toBeCloseTo(1.6, 2);
  });

  it('flags tail divergence when ratio strictly exceeds 1.5 threshold', () => {
    const res = computeTailDivergence(2000, 3200, 1.5);
    expect(res.isTailDivergent).toBe(true);
    expect(res.warningMessage).toContain('Tail risk divergence detected');
  });

  it('does not flag divergence under Gaussian/normal distribution (ratio <= 1.5)', () => {
    const res = computeTailDivergence(2000, 2400, 1.5);
    expect(res.isTailDivergent).toBe(false);
    expect(res.warningMessage).toBeUndefined();
  });

  it('evaluates boundary condition: ratio at exactly 1.500000 is not divergent', () => {
    const res = computeTailDivergence(1000, 1500, 1.5);
    expect(res.ratio).toBe(1.5);
    expect(res.isTailDivergent).toBe(false);
  });

  it('evaluates boundary condition: ratio at 1.50001 is divergent', () => {
    const res = computeTailDivergence(1000, 1500.1, 1.5);
    expect(res.isTailDivergent).toBe(true);
  });

  it('handles near-zero and zero parametric CVaR without NaN or crashing', () => {
    const res = computeTailDivergence(0, 100, 1.5);
    expect(Number.isFinite(res.ratio)).toBe(true);
    expect(res.isTailDivergent).toBe(true);
  });

  it('handles negative or invalid numbers safely', () => {
    const res = computeTailDivergence(-10, -5, 1.5);
    expect(res.ratio).toBe(0);
    expect(res.isTailDivergent).toBe(false);
  });

  it('TailDivergenceDetector tracks alert state and recommended multipliers', () => {
    const detector = new TailDivergenceDetector(1.5);
    expect(detector.isAlertActive()).toBe(false);
    expect(detector.getRecommendedCashBufferMultiplier()).toBe(1.0);
    expect(detector.getRecommendedLeverageReduction()).toBe(1.0);

    const normal = detector.evaluate(2000, 2200);
    expect(normal.isTailDivergent).toBe(false);
    expect(detector.isAlertActive()).toBe(false);

    const jump = detector.evaluate(2000, 3600);
    expect(jump.isTailDivergent).toBe(true);
    expect(detector.isAlertActive()).toBe(true);
    expect(detector.getRecommendedCashBufferMultiplier()).toBe(1.25);
    expect(detector.getRecommendedLeverageReduction()).toBe(0.75);
    expect(detector.getLastResult()?.ratio).toBeCloseTo(1.8, 2);
  });
});
