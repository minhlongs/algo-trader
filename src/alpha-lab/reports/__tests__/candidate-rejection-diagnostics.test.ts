import { describe, it, expect } from 'vitest';
import { generateCandidateRejectionDiagnostics } from '../candidate-rejection-diagnostics';
import { evaluateAlphaSurvivalGate } from '../../attribution/alpha-survival-gate';
import type { WalkForwardSummary } from '../../walkforward/walkforward-types';
import type { BacktestTrade } from '../../../desk/backtesting/types';
import type { ExperimentConfig } from '../../experiments/experiment-types';

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
    cumulativeEquity: [],
    ...overrides,
  };
}

const mockConfig: ExperimentConfig = {
  experimentId: 'strat-test-1',
  hypothesis: 'test hypothesis',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  features: ['returns'],
  regimes: 'all',
  tp: 0.02,
  sl: 0.01,
  maxHolding: 24,
  lookback: 20,
  split: { mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25 },
  cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  seed: 42,
  gitCommit: 'dev',
  createdAt: '2025-01-01T00:00:00Z',
};

describe('Candidate Rejection Diagnostics', () => {
  it('returns empty diagnostics for a passing candidate', () => {
    const summary = createMockSummary();
    const trades: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'TREND_UP',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl: 0.03,
    }));
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades });
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);

    expect(diagnostics).toHaveLength(0);
  });

  it('generates Stop-Loss Tightening diagnostic when Sharpe < 1.0 but winRate >= 0.50', () => {
    const summary = createMockSummary({ testSharpe: 0.6, testWinRate: 0.55 });
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: [] });
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);

    const sharpeDiag = diagnostics.find((d) => d.metric === 'oos_sharpe_ratio');
    expect(sharpeDiag).toBeDefined();
    expect(sharpeDiag!.refinementHypothesis).toBe('Stop-Loss Tightening');
    expect(sharpeDiag!.reason).toContain('Large losing trades drag down');
    expect(sharpeDiag!.details?.recommendedParamChanges?.stopLossBps).toBe(75);
  });

  it('generates Drawdown Reduction diagnostic when max drawdown exceeds 15%', () => {
    const summary = createMockSummary({ testMaxDrawdown: 0.25 });
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: [] });
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);

    const ddDiag = diagnostics.find((d) => d.metric === 'max_drawdown');
    expect(ddDiag).toBeDefined();
    expect(ddDiag!.refinementHypothesis).toBe('Drawdown Reduction');
    expect(ddDiag!.value).toBe(0.25);
    expect(ddDiag!.threshold).toBe(0.15);
  });

  it('generates Regime Filter diagnostic when regime consistency is below 0.50', () => {
    const summary = createMockSummary({ regimeConsistencyScore: 0.25 });
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: [] });
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);

    const regDiag = diagnostics.find((d) => d.metric === 'regime_consistency_score');
    expect(regDiag).toBeDefined();
    expect(regDiag!.refinementHypothesis).toBe('Regime Filter');
    expect(regDiag!.details?.suggestedRegimeFilter).toContain('TREND_UP');
  });

  it('generates Trade Frequency Reduction diagnostic when conservative cost stress fails', () => {
    const summary = createMockSummary();
    const trades: BacktestTrade[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY',
      price: 100,
      size: 1,
      pnl: 0.0001,
    }));
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades });
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);

    const costDiag = diagnostics.find((d) => d.metric === 'cost_stress_conservative');
    expect(costDiag).toBeDefined();
    expect(costDiag!.refinementHypothesis).toBe('Trade Frequency Reduction');
  });
});
