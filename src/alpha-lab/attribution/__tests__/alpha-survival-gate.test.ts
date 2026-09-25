import { describe, it, expect } from 'vitest';
import { evaluateAlphaSurvivalGate, DEFAULT_ALPHA_SURVIVAL_CRITERIA } from '../alpha-survival-gate';
import type { WalkForwardSummary } from '../../walkforward/walkforward-types';
import type { BacktestTrade } from '../../../desk/backtesting/types';

function createMockSummary(overrides?: Partial<WalkForwardSummary>): WalkForwardSummary {
  return {
    totalSteps: 4,
    trainWinRate: 0.65,
    valWinRate: 0.60,
    testWinRate: 0.58,
    overfitGap: 0.07,
    consistencyScore: 0.75,
    regimeConsistencyScore: 0.80,
    avgTestTrades: 10,
    totalTestTrades: 40,
    testSharpe: 1.5,
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

function createMockTrades(count = 20, winRate = 0.6, tp = 0.02, sl = 0.01): BacktestTrade[] {
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

describe('Alpha Survival Gate', () => {
  it('passes a robust candidate meeting all 4 quantitative criteria', () => {
    const summary = createMockSummary();
    const trades = createMockTrades(30, 0.7, 0.03, 0.01);
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(true);
    expect(result.checks.sharpePassed).toBe(true);
    expect(result.checks.drawdownPassed).toBe(true);
    expect(result.checks.regimeConsistencyPassed).toBe(true);
    expect(result.checks.costStressConservativePassed).toBe(true);
    expect(result.checks.costStressAdversePassed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('rejects a candidate with Sharpe < 1.0', () => {
    const summary = createMockSummary({ testSharpe: 0.75 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.sharpePassed).toBe(false);
    expect(result.failures[0]).toContain('Sharpe ratio of 0.75 is below hurdle rate 1.00');
  });

  it('rejects a candidate with Max Drawdown > 15%', () => {
    const summary = createMockSummary({ testMaxDrawdown: 0.22 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.drawdownPassed).toBe(false);
    expect(result.failures[0]).toContain('22.0% exceeds allowable ceiling of 15.0%');
  });

  it('normalizes negative Max Drawdown sign convention correctly', () => {
    const summary = createMockSummary({ testMaxDrawdown: -0.12 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.checks.drawdownPassed).toBe(true);
    expect(result.maxDrawdown).toBe(0.12);
  });

  it('rejects a candidate with Regime Consistency < 0.50', () => {
    const summary = createMockSummary({ regimeConsistencyScore: 0.33 });
    const trades = createMockTrades();
    const result = evaluateAlphaSurvivalGate({ summary, trades });

    expect(result.passed).toBe(false);
    expect(result.checks.regimeConsistencyPassed).toBe(false);
    expect(result.failures[0]).toContain('Regime consistency score of 0.33 is below minimum 0.50');
  });

  it('rejects a candidate whose edge collapses under 20 bps conservative cost stress', () => {
    const summary = createMockSummary();
    // Trades with tiny gross wins (0.0015 = 15 bps) that cannot cover 20 bps round-trip friction
    const trades: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl: 0.0001, // barely positive after 14 bps, negative after 20 bps
    }));

    const result = evaluateAlphaSurvivalGate({ summary, trades });
    expect(result.passed).toBe(false);
    expect(result.checks.costStressConservativePassed).toBe(false);
    expect(result.failures.some((f) => f.includes('CONSERVATIVE cost stress'))).toBe(true);
  });

  it('rejects a candidate that survives conservative but fails 50 bps adverse cost stress', () => {
    const summary = createMockSummary();
    // Trades with gross win ~ 35 bps: positive under 20 bps, negative under 50 bps
    const trades: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl: 0.0021, // gross = 0.0035. Under 20 bps -> +0.0015. Under 50 bps -> -0.0015.
    }));

    const result = evaluateAlphaSurvivalGate({ summary, trades });
    expect(result.checks.costStressConservativePassed).toBe(true);
    expect(result.checks.costStressAdversePassed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('ADVERSE cost stress'))).toBe(true);
  });
});
