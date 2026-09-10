/**
 * Tests for ab-test-stats — two-proportion z-test and recommendation builder.
 *
 * Covers: small-sample guard, degenerate-pool guard, significant and
 * non-significant results, and all three recommendation branches.
 */

import { describe, it, expect } from 'vitest';
import { computeSignificance, buildRecommendation } from '../ab-test-stats';
import type { GroupStats, GroupName } from '../ab-test-manager';

function makeGroup(overrides: Partial<GroupStats> = {}): GroupStats {
  return {
    name: 'g',
    total: 100,
    correct: 50,
    accuracy: 0.5,
    avgConfidence: 0.7,
    avgPnl: 0,
    ...overrides,
  };
}

describe('computeSignificance', () => {
  it('returns p=1, not significant when either group has < 2 samples', () => {
    const control = makeGroup({ total: 1, correct: 0, accuracy: 0 });
    const treatment = makeGroup({ total: 100, correct: 90, accuracy: 0.9 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBe(1);
    expect(r.significant).toBe(false);
  });

  it('returns p=1 when pooled proportion is 0 (all wrong)', () => {
    const control = makeGroup({ total: 50, correct: 0, accuracy: 0 });
    const treatment = makeGroup({ total: 50, correct: 0, accuracy: 0 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBe(1);
    expect(r.significant).toBe(false);
  });

  it('returns p=1 when pooled proportion is 1 (all correct)', () => {
    const control = makeGroup({ total: 50, correct: 50, accuracy: 1 });
    const treatment = makeGroup({ total: 50, correct: 50, accuracy: 1 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBe(1);
    expect(r.significant).toBe(false);
  });

  it('detects a clearly significant difference', () => {
    // 30/100 vs 70/100 accuracy → z ≈ 5.66, p < 0.001
    const control = makeGroup({ total: 100, correct: 30, accuracy: 0.3 });
    const treatment = makeGroup({ total: 100, correct: 70, accuracy: 0.7 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBeLessThan(0.001);
    expect(r.significant).toBe(true);
  });

  it('covers the negative-z path (treatment worse than control)', () => {
    // 70/100 vs 30/100 → z ≈ -5.66, same p-value as positive case
    const control = makeGroup({ total: 100, correct: 70, accuracy: 0.7 });
    const treatment = makeGroup({ total: 100, correct: 30, accuracy: 0.3 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBeLessThan(0.001);
    expect(r.significant).toBe(true);
  });

  it('detects no significant difference for identical groups', () => {
    const control = makeGroup({ total: 100, correct: 50, accuracy: 0.5 });
    const treatment = makeGroup({ total: 100, correct: 50, accuracy: 0.5 });
    const r = computeSignificance(control, treatment, 0.95);
    expect(r.pValue).toBeGreaterThan(0.99);
    expect(r.significant).toBe(false);
  });

  it('respects a stricter confidence level', () => {
    // Moderate difference: 45/100 vs 60/100 → z ≈ 2.13, p ≈ 0.033
    const control = makeGroup({ total: 100, correct: 45, accuracy: 0.45 });
    const treatment = makeGroup({ total: 100, correct: 60, accuracy: 0.6 });
    const at95 = computeSignificance(control, treatment, 0.95);
    const at99 = computeSignificance(control, treatment, 0.99);
    expect(at95.significant).toBe(true);
    expect(at99.significant).toBe(false);
  });
});

describe('buildRecommendation', () => {
  it('reports insufficient data when total below minSamples', () => {
    const control = makeGroup({ total: 10, correct: 5, accuracy: 0.5 });
    const treatment = makeGroup({ total: 10, correct: 8, accuracy: 0.8 });
    const r = buildRecommendation(control, treatment, true, 'treatment', 30);
    expect(r).toBe('Insufficient data: 20/30 samples collected');
  });

  it('recommends continuing when not significant', () => {
    const control = makeGroup({ total: 50, correct: 25, accuracy: 0.5 });
    const treatment = makeGroup({ total: 50, correct: 26, accuracy: 0.52 });
    const r = buildRecommendation(control, treatment, false, null, 30);
    expect(r).toBe('No statistically significant difference detected — continue experiment');
  });

  it('declares the winner when significant', () => {
    const control = makeGroup({ total: 100, correct: 40, accuracy: 0.4 });
    const treatment = makeGroup({ total: 100, correct: 70, accuracy: 0.7 });
    const winner: GroupName = 'treatment';
    const r = buildRecommendation(control, treatment, true, winner, 30);
    expect(r).toContain('Significant: treatment group outperforms');
    expect(r).toContain('Control: 40.0%');
    expect(r).toContain('Treatment: 70.0%');
  });
});
