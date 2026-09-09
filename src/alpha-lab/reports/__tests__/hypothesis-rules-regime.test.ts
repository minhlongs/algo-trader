import { describe, it, expect } from 'vitest';
import {
  detectRegimeFilter,
  detectSeasonality,
  detectVolatilityDegradation,
  detectOverfit,
} from '../hypothesis-rules-regime';
import type { EvaluationReport } from '../../evaluation/evaluation-types';
import type { CandidateResult } from '../../attribution/alpha-evaluator';
import type { BaselineRun } from '../../baselines/baseline-runner';

function emptyReport(): EvaluationReport {
  return {
    overall: {
      totalTrades: 100, winningTrades: 50, losingTrades: 50,
      winRate: 0.5, lossRate: 0.5, profitFactor: 1.5,
      avgPnlPerTrade: 0.001, totalNetPnl: 0.1, maxDrawdown: 0.1, sharpeRatio: 1.0,
    },
    byRegime: [],
    byMonth: [],
    byVolatilityBucket: [],
  };
}

describe('detectRegimeFilter', () => {
  it('returns empty when less than 2 regimes present', () => {
    const report = emptyReport();
    expect(detectRegimeFilter(report)).toEqual([]);
    report.byRegime = [{ regime: 'TRENDING_UP', numTrades: 10, winRate: 0.6, lossRate: 0.4, meanLabel: 0.1, netPnl: 0.05 }];
    expect(detectRegimeFilter(report)).toEqual([]);
  });

  it('returns empty when best regime netPnl is non-positive', () => {
    const report = emptyReport();
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 10, winRate: 0.5, lossRate: 0.5, meanLabel: 0, netPnl: 0 },
      { regime: 'RANGING', numTrades: 10, winRate: 0.4, lossRate: 0.6, meanLabel: -0.1, netPnl: -0.05 },
    ];
    expect(detectRegimeFilter(report)).toEqual([]);
  });

  it('returns empty when other regimes do not all have negative netPnl', () => {
    const report = emptyReport();
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 20, winRate: 0.6, lossRate: 0.4, meanLabel: 0.2, netPnl: 0.1 },
      { regime: 'RANGING', numTrades: 20, winRate: 0.55, lossRate: 0.45, meanLabel: 0.1, netPnl: 0.02 },
    ];
    expect(detectRegimeFilter(report)).toEqual([]);
  });

  it('generates hypothesis and clamps confidence when gap is large, even if best regime is not first', () => {
    const report = emptyReport();
    report.byRegime = [
      { regime: 'BEAR', numTrades: 50, winRate: 0.2, lossRate: 0.8, meanLabel: -0.5, netPnl: -0.5 },
      { regime: 'BULL', numTrades: 50, winRate: 0.8, lossRate: 0.2, meanLabel: 0.5, netPnl: 0.5 },
    ];
    const res = detectRegimeFilter(report);
    expect(res).toHaveLength(1);
    expect(res[0]!.confidence).toBe(1);
    expect(res[0]!.regimeFilter).toEqual(['BULL']);
  });
});

describe('detectSeasonality', () => {
  it('returns empty when fewer than 3 months', () => {
    const report = emptyReport();
    report.byMonth = [
      { month: '2025-01', numTrades: 10, winRate: 0.5, netPnl: 0.05 },
      { month: '2025-02', numTrades: 10, winRate: 0.5, netPnl: 0.05 },
    ];
    expect(detectSeasonality(report)).toEqual([]);
  });

  it('returns empty when monthly PnL mean is zero or CV <= 1.5', () => {
    const report = emptyReport();
    report.byMonth = [
      { month: '2025-01', numTrades: 10, winRate: 0.5, netPnl: 1 },
      { month: '2025-02', numTrades: 10, winRate: 0.5, netPnl: -1 },
      { month: '2025-03', numTrades: 10, winRate: 0.5, netPnl: 0 },
    ];
    expect(detectSeasonality(report)).toEqual([]);

    report.byMonth = [
      { month: '2025-01', numTrades: 10, winRate: 0.5, netPnl: 10 },
      { month: '2025-02', numTrades: 10, winRate: 0.5, netPnl: 11 },
      { month: '2025-03', numTrades: 10, winRate: 0.5, netPnl: 10 },
    ];
    expect(detectSeasonality(report)).toEqual([]);
  });

  it('handles only positive months and clamps high CV confidence', () => {
    const report = emptyReport();
    report.byMonth = [
      { month: '2024-01', numTrades: 10, winRate: 0.9, netPnl: 1000 },
      ...Array.from({ length: 19 }, (_, i) => ({
        month: `2024-${String(i + 2).padStart(2, '0')}`, numTrades: 10, winRate: 0.5, netPnl: 0.001,
      })),
    ];
    const res = detectSeasonality(report);
    expect(res).toHaveLength(1);
    expect(res[0]!.confidence).toBe(1);
    expect(res[0]!.evidence.some((e) => e.startsWith('Positive months:'))).toBe(true);
    expect(res[0]!.evidence.some((e) => e.startsWith('Negative months:'))).toBe(false);
  });

  it('handles only negative months with high CV', () => {
    const report = emptyReport();
    report.byMonth = [
      { month: '2024-01', numTrades: 10, winRate: 0.1, netPnl: -1000 },
      ...Array.from({ length: 19 }, (_, i) => ({
        month: `2024-${String(i + 2).padStart(2, '0')}`, numTrades: 10, winRate: 0.5, netPnl: -0.001,
      })),
    ];
    const res = detectSeasonality(report);
    expect(res).toHaveLength(1);
    expect(res[0]!.evidence.some((e) => e.startsWith('Positive months:'))).toBe(false);
    expect(res[0]!.evidence.some((e) => e.startsWith('Negative months:'))).toBe(true);
  });
});

describe('detectVolatilityDegradation', () => {
  it('returns empty when fewer than 2 buckets or high bucket missing', () => {
    const report = emptyReport();
    expect(detectVolatilityDegradation(report)).toEqual([]);

    report.byVolatilityBucket = [
      { bucket: 'low', numTrades: 10, winRate: 0.5, netPnl: 0.05 },
      { bucket: 'medium', numTrades: 10, winRate: 0.5, netPnl: 0.02 },
    ];
    expect(detectVolatilityDegradation(report)).toEqual([]);
  });

  it('returns empty when high-vol netPnl is >= best non-high bucket', () => {
    const report = emptyReport();
    report.byVolatilityBucket = [
      { bucket: 'low', numTrades: 10, winRate: 0.5, netPnl: 0.02 },
      { bucket: 'high', numTrades: 10, winRate: 0.6, netPnl: 0.05 },
    ];
    expect(detectVolatilityDegradation(report)).toEqual([]);
  });

  it('generates hypothesis with clamped confidence when gap is large, testing non-high bucket comparisons', () => {
    const report1 = emptyReport();
    report1.byVolatilityBucket = [
      { bucket: 'low', numTrades: 10, winRate: 0.8, netPnl: 0.8 },
      { bucket: 'medium', numTrades: 10, winRate: 0.5, netPnl: 0.3 },
      { bucket: 'high', numTrades: 10, winRate: 0.2, netPnl: -0.5 },
    ];
    const res1 = detectVolatilityDegradation(report1);
    expect(res1).toHaveLength(1);
    expect(res1[0]!.confidence).toBe(1);
    expect(res1[0]!.features).toContain('volatilityFilter');

    const report2 = emptyReport();
    report2.byVolatilityBucket = [
      { bucket: 'low', numTrades: 10, winRate: 0.5, netPnl: 0.3 },
      { bucket: 'medium', numTrades: 10, winRate: 0.8, netPnl: 0.8 },
      { bucket: 'high', numTrades: 10, winRate: 0.2, netPnl: -0.5 },
    ];
    const res2 = detectVolatilityDegradation(report2);
    expect(res2).toHaveLength(1);
    expect(res2[0]!.confidence).toBe(1);
  });
});

describe('detectOverfit', () => {
  const candidate: CandidateResult = {
    name: 'test', totalNetPnl: 50, winRate: 0.55, sharpeRatio: 1.0,
    totalTrades: 100, profitFactor: 1.5, maxDrawdown: 0.1,
  };

  const makeBaseline = (name: string, totalPnl: number): BaselineRun => ({
    name, equityCurve: [],
    report: {
      totalPnl, sharpeRatio: 0, maxDrawdown: 0, winRate: 0.5, profitFactor: 1,
      totalTrades: 10, winningTrades: 5, losingTrades: 5, bestTrade: 0, worstTrade: 0, avgPnlPerTrade: 0,
    },
  });

  it('returns empty when baselines are missing buy-and-hold or random-entry', () => {
    expect(detectOverfit(candidate, [makeBaseline('buy-and-hold', 20)])).toEqual([]);
    expect(detectOverfit(candidate, [makeBaseline('random-entry', 60)])).toEqual([]);
  });

  it('returns empty when candidate does not beat buy-and-hold', () => {
    const baselines = [makeBaseline('buy-and-hold', 60), makeBaseline('random-entry', 80)];
    expect(detectOverfit(candidate, baselines)).toEqual([]);
  });

  it('returns empty when candidate beats random-entry', () => {
    const baselines = [makeBaseline('buy-and-hold', 20), makeBaseline('random-entry', 40)];
    expect(detectOverfit(candidate, baselines)).toEqual([]);
  });
});
