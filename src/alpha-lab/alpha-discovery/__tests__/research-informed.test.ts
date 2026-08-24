/**
 * Research-Informed Prioritization tests
 *
 * Covers: all 3 policies (explore-first, retest-failed, validated-last),
 * never-tested-first behavior, tie behavior (stable sort), empty summary
 * (no-verdict-data), and deterministic output.
 */

import { describe, it, expect } from 'vitest';

import { prioritizeFamilies } from '../research-informed';
import { createDefaultRegistry } from '../strategy-family-registry';
import type { VerdictSummary } from '../../provenance/verdict-summary';

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptySummary(): VerdictSummary {
  return { byStrategy: {}, totalRecords: 0 };
}

function summaryWith(
  entries: Record<string, { totalRuns: number; passedCount: number; passRate: number; lastVerdictPassed: boolean | null }>,
): VerdictSummary {
  const byStrategy: VerdictSummary['byStrategy'] = {};
  for (const [ref, data] of Object.entries(entries)) {
    byStrategy[ref] = {
      strategyRef: ref,
      totalRuns: data.totalRuns,
      passedCount: data.passedCount,
      passRate: data.passRate,
      lastVerdictPassed: data.lastVerdictPassed,
      lastResultClass: 'IS',
      lastRecordedAt: '2026-08-25T10:00:00.000Z',
    };
  }
  return { byStrategy, totalRecords: Object.values(entries).reduce((s, e) => s + e.totalRuns, 0) };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('prioritizeFamilies', () => {
  const registry = createDefaultRegistry();
  const familyIds = registry.list().map((f) => f.id);

  it('returns all families with no-verdict-data when summary is empty', () => {
    const result = prioritizeFamilies(registry, emptySummary());
    expect(result).toHaveLength(familyIds.length);
    expect(result.every((r) => r.reason === 'no-verdict-data')).toBe(true);
    // Stable order: matches registry.list() order.
    expect(result.map((r) => r.familyId)).toEqual(familyIds);
  });

  it('explore-first: never-tested families rank highest', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 3, passedCount: 1, passRate: 1 / 3, lastVerdictPassed: false },
      'trend-following': { totalRuns: 2, passedCount: 2, passRate: 1, lastVerdictPassed: true },
    });

    const result = prioritizeFamilies(registry, summary, { policy: 'explore-first' });

    // never-tested families (mean-reversion, volatility-breakout) should be first.
    const neverTested = result.filter((r) => r.reason === 'never-tested');
    const failed = result.filter((r) => r.reason === 'failed-verdict');
    const passed = result.filter((r) => r.reason === 'passed-demoted');

    expect(neverTested.length).toBe(2); // mean-reversion + volatility-breakout
    expect(failed.length).toBe(1); // momentum-breakout
    expect(passed.length).toBe(1); // trend-following

    // never-tested rank before failed, which ranks before passed.
    const maxNeverTestedRank = Math.max(...neverTested.map((r) => r.rank));
    const minFailedRank = Math.min(...failed.map((r) => r.rank));
    const minPassedRank = Math.min(...passed.map((r) => r.rank));
    expect(maxNeverTestedRank).toBeLessThan(minFailedRank);
    expect(minFailedRank).toBeLessThan(minPassedRank);
  });

  it('retest-failed: failed families rank highest', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 3, passedCount: 1, passRate: 1 / 3, lastVerdictPassed: false },
      'trend-following': { totalRuns: 2, passedCount: 2, passRate: 1, lastVerdictPassed: true },
    });

    const result = prioritizeFamilies(registry, summary, { policy: 'retest-failed' });

    const failed = result.filter((r) => r.reason === 'failed-verdict');
    const neverTested = result.filter((r) => r.reason === 'never-tested');
    const passed = result.filter((r) => r.reason === 'passed-demoted');

    expect(failed.length).toBe(1);
    expect(neverTested.length).toBe(2);
    expect(passed.length).toBe(1);

    // failed ranks before never-tested.
    const maxFailedRank = Math.max(...failed.map((r) => r.rank));
    const minNeverTestedRank = Math.min(...neverTested.map((r) => r.rank));
    expect(maxFailedRank).toBeLessThan(minNeverTestedRank);
  });

  it('validated-last: passed families rank first, failed rank last', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 3, passedCount: 1, passRate: 1 / 3, lastVerdictPassed: false },
      'trend-following': { totalRuns: 2, passedCount: 2, passRate: 1, lastVerdictPassed: true },
    });

    const result = prioritizeFamilies(registry, summary, { policy: 'validated-last' });

    const passed = result.filter((r) => r.reason === 'passed-demoted');
    const failed = result.filter((r) => r.reason === 'failed-verdict');

    // passed-demoted gets priority 0 (ranks first), failed gets priority 3 (last).
    const maxPassedRank = Math.max(...passed.map((r) => r.rank));
    const minFailedRank = Math.min(...failed.map((r) => r.rank));
    expect(maxPassedRank).toBeLessThan(minFailedRank);
  });

  it('deterministic: same input always produces same rank order', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 1, passedCount: 0, passRate: 0, lastVerdictPassed: false },
    });

    const first = prioritizeFamilies(registry, summary);
    const second = prioritizeFamilies(registry, summary);
    expect(first.map((r) => r.familyId)).toEqual(second.map((r) => r.familyId));
    expect(first.map((r) => r.reason)).toEqual(second.map((r) => r.reason));
  });

  it('never-tested families get never-tested reason when not in summary', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 1, passedCount: 0, passRate: 0, lastVerdictPassed: false },
    });

    const result = prioritizeFamilies(registry, summary);
    const neverTested = result.filter((r) => r.reason === 'never-tested');
    expect(neverTested.map((r) => r.familyId)).toContain('trend-following');
    expect(neverTested.map((r) => r.familyId)).toContain('mean-reversion');
  });

  it('classify passed-demoted correctly when passRate > 0 and lastVerdictPassed', () => {
    const summary = summaryWith({
      'trend-following': { totalRuns: 5, passedCount: 4, passRate: 0.8, lastVerdictPassed: true },
    });

    const result = prioritizeFamilies(registry, summary);
    const entry = result.find((r) => r.familyId === 'trend-following');
    expect(entry?.reason).toBe('passed-demoted');
  });

  it('classify failed-verdict when lastVerdictPassed is false', () => {
    const summary = summaryWith({
      'momentum-breakout': { totalRuns: 3, passedCount: 1, passRate: 1 / 3, lastVerdictPassed: false },
    });

    const result = prioritizeFamilies(registry, summary);
    const entry = result.find((r) => r.familyId === 'momentum-breakout');
    expect(entry?.reason).toBe('failed-verdict');
  });
});
