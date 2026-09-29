import { describe, it, expect } from 'vitest';
import {
  evaluateAlphaSurvivalGate,
  DEFAULT_ALPHA_SURVIVAL_CRITERIA,
} from '../alpha-survival-gate';
import type { WalkForwardSummary } from '../../walkforward/walkforward-types';
import type { BacktestTrade } from '../../../desk/backtesting/types';

function createMockSummary(overrides?: Partial<WalkForwardSummary>): WalkForwardSummary {
  return {
    totalSteps: 5,
    trainWinRate: 0.65,
    valWinRate: 0.60,
    testWinRate: 0.58,
    overfitGap: 0.07,
    consistencyScore: 0.75,
    regimeConsistencyScore: 0.80,
    avgTestTrades: 10,
    totalTestTrades: 40,
    testSharpe: 1.8,
    testMaxDrawdown: 0.08,
    testProfitFactor: 1.8,
    testTotalPnl: 0.25,
    cumulativeEquity: [
      { timestamp: '2025-01-01T00:00:00Z', equity: 1.0 },
      { timestamp: '2025-01-02T00:00:00Z', equity: 1.1 },
      { timestamp: '2025-01-03T00:00:00Z', equity: 1.25 },
    ],
    ...overrides,
  };
}

function createMockTrades(count = 30, winRate = 0.7, tp = 0.03, sl = 0.01): BacktestTrade[] {
  return Array.from({ length: count }, (_, i) => {
    const isWin = i / count < winRate;
    const pnl = isWin ? tp - 0.0014 : -sl - 0.0014;
    return {
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: i % 2 === 0 ? 'TREND_UP' : 'RANGE',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl,
    };
  });
}

describe('Alpha Survival Gate (M2 Institutional Gates & Overfitting Filters)', () => {
  it('passes a robust candidate meeting all 6 criteria', () => {
    const summary = createMockSummary();
    const trades = createMockTrades(30, 0.7, 0.03, 0.01);
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(true);
    expect(result.checks.sharpePassed).toBe(true);
    expect(result.checks.drawdownPassed).toBe(true);
    expect(result.checks.profitFactorPassed).toBe(true);
    expect(result.checks.dsrPassed).toBe(true);
    expect(result.checks.costStressPassed).toBe(true);
    expect(result.checks.regimeConsistencyPassed).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects candidate with Sharpe < 1.5 by default and supports custom criteria', () => {
    const summary = createMockSummary({ testSharpe: 1.3 });
    const trades = createMockTrades();
    const resultDefault = evaluateAlphaSurvivalGate({ summary, trades });
    expect(resultDefault.passed).toBe(false);
    expect(resultDefault.checks.sharpePassed).toBe(false);
    expect(resultDefault.diagnostics[0]).toContain('Sharpe ratio of 1.30 is below hurdle rate 1.50');

    // Backward-compatibility: custom criteria overriding minOosSharpeRatio
    const resultCustom = evaluateAlphaSurvivalGate({
      summary: createMockSummary({ testSharpe: 0.75 }),
      trades,
      criteria: { minOosSharpeRatio: 1.0 },
    });
    expect(resultCustom.checks.sharpePassed).toBe(false);
    expect(resultCustom.diagnostics[0]).toContain('Sharpe ratio of 0.75 is below hurdle rate 1.00');
  });

  it('rejects candidate with Max Drawdown > 12% by default and normalizes sign', () => {
    const summary = createMockSummary({ testMaxDrawdown: -0.14 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.drawdownPassed).toBe(false);
    expect(result.maxDrawdown).toBe(0.14);
    expect(result.diagnostics[0]).toContain('14.0% exceeds allowable ceiling of 12.0%');

    // Legacy custom 15% ceiling
    const customResult = evaluateAlphaSurvivalGate({
      summary: createMockSummary({ testMaxDrawdown: 0.22 }),
      trades,
      criteria: { maxDrawdown: 0.15 },
    });
    expect(customResult.checks.drawdownPassed).toBe(false);
    expect(customResult.diagnostics[0]).toContain('22.0% exceeds allowable ceiling of 15.0%');
  });

  it('rejects candidate with Profit Factor < 1.25', () => {
    const summary = createMockSummary({ testProfitFactor: 1.15 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.profitFactorPassed).toBe(false);
    expect(result.diagnostics.some((d) => d.includes('Profit Factor of 1.15 is below minimum hurdle 1.25'))).toBe(true);
  });

  it('filters candidate under multiple testing selection bias (DSR < 0.95 with nTrials = 200)', () => {
    const summary = createMockSummary({ testSharpe: 1.55 });
    const trades = createMockTrades(30, 0.65, 0.02, 0.01);
    const result = evaluateAlphaSurvivalGate({
      summary,
      trades,
      nTrials: 200,
      trialsVariance: 0.25,
    });

    expect(result.passed).toBe(false);
    expect(result.checks.dsrPassed).toBe(false);
    expect(result.dsr).toBeLessThan(0.95);
    expect(result.diagnostics.some((d) => d.includes('Deflated Sharpe Ratio (DSR)'))).toBe(true);
  });

  it('penalizes candidate with severely negative return skewness in DSR', () => {
    const summary = createMockSummary({ testSharpe: 1.52 });
    // Returns with extreme left tail
    const skewedReturns = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, -0.09];
    const result = evaluateAlphaSurvivalGate({
      summary,
      periodicReturns: skewedReturns,
      nTrials: 5,
    });

    expect(result.metrics.skewness).toBeLessThan(-1.0);
    expect(result.checks.dsrPassed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('rejects candidate when edge collapses under 3x cost stress (30 bps friction)', () => {
    const summary = createMockSummary();
    // Trades with only 0.0018 (18 bps) gross win: positive after 10 bps, negative after 30 bps
    const trades: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl: 0.0008, // gross = 0.0008 + 0.0010 = 0.0018. Under 30 bps -> 0.0018 - 0.0030 = -0.0012
    }));

    const result = evaluateAlphaSurvivalGate({ summary, trades });
    expect(result.passed).toBe(false);
    expect(result.checks.costStressPassed).toBe(false);
    expect(result.diagnostics.some((d) => d.includes('3x cost stress'))).toBe(true);
  });

  it('rejects candidate with Regime Consistency < 0.70 by default and supports custom criteria', () => {
    const summary = createMockSummary({ regimeConsistencyScore: 0.65 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.regimeConsistencyPassed).toBe(false);
    expect(result.diagnostics[0]).toContain('Regime consistency score of 0.65 is below minimum 0.70');

    // Legacy custom 0.50 threshold
    const customResult = evaluateAlphaSurvivalGate({
      summary: createMockSummary({ regimeConsistencyScore: 0.33 }),
      trades,
      criteria: { minRegimeConsistencyScore: 0.50 },
    });
    expect(customResult.checks.regimeConsistencyPassed).toBe(false);
    expect(customResult.diagnostics[0]).toContain('Regime consistency score of 0.33 is below minimum 0.50');
  });

  it('aggregates multiple diagnostic failures cleanly', () => {
    const summary = createMockSummary({
      testSharpe: 0.8,
      testMaxDrawdown: 0.20,
      testProfitFactor: 0.9,
      regimeConsistencyScore: 0.4,
    });
    const result = evaluateAlphaSurvivalGate({ summary, trades: [] });

    expect(result.passed).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(4);
    expect(result.failures).toEqual(result.diagnostics);
    expect(result.rejectionReasons).toEqual(result.diagnostics);
  });
});
