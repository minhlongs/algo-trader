import { describe, it, expect } from 'vitest';
import {
  generateHypotheses,
  summarizeHypotheses,
  type Hypothesis,
} from '../../../../src/alpha-lab/reports/hypothesis-generator';
import type { EvaluationReport } from '../../../../src/alpha-lab/evaluation/evaluation-types';
import type { CandidateResult } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import type { BaselineRun } from '../../../../src/alpha-lab/baselines/baseline-runner';

function makeReport(overrides: Partial<EvaluationReport['overall']> = {}): EvaluationReport {
  return {
    overall: {
      totalTrades: 100,
      winningTrades: 55,
      losingTrades: 45,
      winRate: 0.55,
      lossRate: 0.45,
      profitFactor: 1.8,
      avgPnlPerTrade: 0.001,
      totalNetPnl: 0.1,
      maxDrawdown: 0.15,
      sharpeRatio: 1.2,
      ...overrides,
    },
    byRegime: [],
    byMonth: [],
    byVolatilityBucket: [],
  };
}

function makeCandidate(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    name: 'test-strategy',
    totalNetPnl: 0.1,
    winRate: 0.55,
    sharpeRatio: 1.2,
    totalTrades: 100,
    profitFactor: 1.8,
    maxDrawdown: 0.15,
    ...overrides,
  };
}

function makeBaseline(
  name: string,
  totalPnl: number,
): BaselineRun {
  return {
    name,
    equityCurve: [],
    report: {
      totalPnl,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0.5,
      profitFactor: 1.0,
      totalTrades: 100,
      winningTrades: 50,
      losingTrades: 50,
      bestTrade: 0.01,
      worstTrade: -0.01,
      avgPnlPerTrade: totalPnl / 100,
    },
  };
}

describe('generateHypotheses', () => {
  it('returns empty array for empty input', () => {
    const result = generateHypotheses({ evaluation: makeReport() });
    expect(result).toEqual([]);
  });

  it('produces regime-filter hypothesis when one regime outperforms others', () => {
    const report = makeReport();
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 50, winRate: 0.6, lossRate: 0.4, meanLabel: 0.2, netPnl: 0.08 },
      { regime: 'RANGING', numTrades: 30, winRate: 0.4, lossRate: 0.6, meanLabel: -0.2, netPnl: -0.03 },
      { regime: 'TRENDING_DOWN', numTrades: 20, winRate: 0.35, lossRate: 0.65, meanLabel: -0.3, netPnl: -0.02 },
    ];

    const result = generateHypotheses({ evaluation: report });
    const regimeHyp = result.find((h) => h.name.includes('Regime'));
    expect(regimeHyp).toBeDefined();
    expect(regimeHyp!.features).toContain('regimeFilter');
    expect(regimeHyp!.regimeFilter).toEqual(['TRENDING_UP']);
    expect(regimeHyp!.confidence).toBeGreaterThan(0);
  });

  it('produces stop-loss hypothesis when win rate is high but Sharpe is negative', () => {
    const report = makeReport({ winRate: 0.6, sharpeRatio: -0.3 });
    const result = generateHypotheses({ evaluation: report });
    const slHyp = result.find((h) => h.name.includes('Stop-Loss'));
    expect(slHyp).toBeDefined();
    expect(slHyp!.features).toContain('stopLoss');
  });

  it('produces drawdown hypothesis when maxDrawdown > 0.3', () => {
    const report = makeReport({ maxDrawdown: 0.4 });
    const result = generateHypotheses({ evaluation: report });
    const ddHyp = result.find((h) => h.name.includes('Drawdown'));
    expect(ddHyp).toBeDefined();
    expect(ddHyp!.features).toContain('positionSizing');
  });

  it('produces profit-factor hypothesis when profitFactor < 1.5', () => {
    const report = makeReport({ profitFactor: 1.2 });
    const result = generateHypotheses({ evaluation: report });
    const pfHyp = result.find((h) => h.name.includes('Profit Factor'));
    expect(pfHyp).toBeDefined();
    expect(pfHyp!.features).toContain('entryTiming');
  });

  it('filters out hypotheses whose name is in previousHypotheses', () => {
    const report = makeReport({ profitFactor: 1.2, maxDrawdown: 0.4 });
    const result1 = generateHypotheses({ evaluation: report });
    const names = result1.map((h) => h.name);
    const result2 = generateHypotheses({
      evaluation: report,
      previousHypotheses: names,
    });
    for (const h of result2) {
      expect(names).not.toContain(h.name);
    }
  });

  it('confidence is always in [0, 1]', () => {
    const report = makeReport({ profitFactor: 1.2, maxDrawdown: 0.4, winRate: 0.65, sharpeRatio: -0.5 });
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 50, winRate: 0.7, lossRate: 0.3, meanLabel: 0.4, netPnl: 0.1 },
      { regime: 'RANGING', numTrades: 30, winRate: 0.3, lossRate: 0.7, meanLabel: -0.4, netPnl: -0.08 },
    ];
    report.byMonth = [
      { month: '2025-01', numTrades: 20, winRate: 0.8, netPnl: 0.05 },
      { month: '2025-02', numTrades: 20, winRate: 0.2, netPnl: -0.04 },
      { month: '2025-03', numTrades: 20, winRate: 0.7, netPnl: 0.04 },
      { month: '2025-04', numTrades: 20, winRate: 0.3, netPnl: -0.03 },
    ];
    report.byVolatilityBucket = [
      { bucket: 'low', numTrades: 40, winRate: 0.6, netPnl: 0.05 },
      { bucket: 'high', numTrades: 40, winRate: 0.3, netPnl: -0.03 },
    ];
    const result = generateHypotheses({ evaluation: report });
    for (const h of result) {
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('caps output at 8 hypotheses', () => {
    const report = makeReport({ profitFactor: 1.2, maxDrawdown: 0.4, winRate: 0.65, sharpeRatio: -0.5 });
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 50, winRate: 0.7, lossRate: 0.3, meanLabel: 0.4, netPnl: 0.1 },
      { regime: 'RANGING', numTrades: 30, winRate: 0.3, lossRate: 0.7, meanLabel: -0.4, netPnl: -0.08 },
    ];
    report.byMonth = [
      { month: '2025-01', numTrades: 20, winRate: 0.8, netPnl: 0.05 },
      { month: '2025-02', numTrades: 20, winRate: 0.2, netPnl: -0.04 },
      { month: '2025-03', numTrades: 20, winRate: 0.7, netPnl: 0.04 },
      { month: '2025-04', numTrades: 20, winRate: 0.3, netPnl: -0.03 },
    ];
    report.byVolatilityBucket = [
      { bucket: 'low', numTrades: 40, winRate: 0.6, netPnl: 0.05 },
      { bucket: 'high', numTrades: 40, winRate: 0.3, netPnl: -0.03 },
    ];
    const result = generateHypotheses({ evaluation: report });
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('same input produces identical output (determinism)', () => {
    const report = makeReport({ profitFactor: 1.2, maxDrawdown: 0.4 });
    report.byRegime = [
      { regime: 'TRENDING_UP', numTrades: 50, winRate: 0.7, lossRate: 0.3, meanLabel: 0.4, netPnl: 0.1 },
      { regime: 'RANGING', numTrades: 30, winRate: 0.3, lossRate: 0.7, meanLabel: -0.4, netPnl: -0.08 },
    ];
    const input = { evaluation: report };
    const a = generateHypotheses(input);
    const b = generateHypotheses(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces overfit hypothesis when candidate beats buy-hold but loses to random', () => {
    const report = makeReport({ totalTrades: 50 });
    const candidate = makeCandidate({ totalNetPnl: 50 });
    const baselines = [
      makeBaseline('buy-and-hold', 30),
      makeBaseline('random-entry', 80),
    ];
    const result = generateHypotheses({ evaluation: report, candidate, baselines });
    const overfitHyp = result.find((h) => h.name.includes('Overfit'));
    expect(overfitHyp).toBeDefined();
  });

  it('produces sample-size hypothesis when trades < 30', () => {
    const report = makeReport({ totalTrades: 15 });
    const result = generateHypotheses({ evaluation: report });
    const ssHyp = result.find((h) => h.name.includes('Sample Size'));
    expect(ssHyp).toBeDefined();
  });
});

describe('summarizeHypotheses', () => {
  it('returns placeholder message when hypotheses array is empty', () => {
    expect(summarizeHypotheses([])).toBe('No hypotheses generated.');
  });

  it('formats hypotheses with both string and array regime filters', () => {
    const hypotheses: Hypothesis[] = [
      {
        name: 'H1',
        description: 'First hypothesis',
        features: ['f1', 'f2'],
        regimeFilter: 'all',
        entryCondition: 'entry',
        exitCondition: 'exit',
        expectedMechanism: 'mech',
        confidence: 0.85,
        evidence: ['ev1'],
      },
      {
        name: 'H2',
        description: 'Second hypothesis',
        features: ['f3'],
        regimeFilter: ['BULL', 'BEAR'],
        entryCondition: 'entry2',
        exitCondition: 'exit2',
        expectedMechanism: 'mech2',
        confidence: 0.42,
        evidence: ['ev2'],
      },
    ];

    const summary = summarizeHypotheses(hypotheses);
    expect(summary).toContain('1. [0.85] H1');
    expect(summary).toContain('Regime: all');
    expect(summary).toContain('2. [0.42] H2');
    expect(summary).toContain('Regime: BULL, BEAR');
  });

  it('returns a non-empty string containing hypothesis names from report', () => {
    const report = makeReport({ profitFactor: 1.2, maxDrawdown: 0.4 });
    const hypotheses = generateHypotheses({ evaluation: report });
    const summary = summarizeHypotheses(hypotheses);
    expect(summary.length).toBeGreaterThan(0);
    for (const h of hypotheses) {
      expect(summary).toContain(h.name);
    }
  });
});
