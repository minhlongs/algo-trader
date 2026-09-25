/**
 * Adversarial Empirical Stress Tests for Milestone 1 Survival Gates & Diagnostics
 *
 * Verifies:
 * 1. Boundary conditions:
 *    - Sharpe = 0.999 (rejected) vs 1.000 (passed) vs 1.001 (passed)
 *    - Max Drawdown = 0.151 / -0.151 (rejected) vs 0.150 / -0.150 (passed) vs 0.149 / -0.149 (passed)
 *    - Cost stress with negative expectancy under 20 bps (conservative) and 50 bps (adverse)
 * 2. Mathematical discrepancies and accuracy of rejectionDiagnostics:
 *    - Exact metric names, values, thresholds, reasons, and hypotheses
 *    - Multi-failure simultaneous diagnostics
 * 3. Edge cases:
 *    - Empty trades array (0 trades)
 *    - Single trade (1 trade)
 *    - 0% win rate (all losses, profit factor = 0)
 *    - 100% win rate (all wins, profit factor = Infinity)
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateAlphaSurvivalGate,
  DEFAULT_ALPHA_SURVIVAL_CRITERIA,
  type AlphaSurvivalGateCriteria,
} from '../../../../src/alpha-lab/attribution/alpha-survival-gate';
import { generateCandidateRejectionDiagnostics } from '../../../../src/alpha-lab/reports/candidate-rejection-diagnostics';
import type { WalkForwardSummary } from '../../../../src/alpha-lab/walkforward/walkforward-types';
import type { BacktestTrade } from '../../../../src/desk/backtesting/types';
import type { ExperimentConfig } from '../../../../src/alpha-lab/experiments/experiment-types';

function createRobustSummary(overrides?: Partial<WalkForwardSummary>): WalkForwardSummary {
  return {
    totalSteps: 5,
    trainWinRate: 0.65,
    valWinRate: 0.60,
    testWinRate: 0.60,
    overfitGap: 0.05,
    consistencyScore: 0.80,
    regimeConsistencyScore: 0.80,
    avgTestTrades: 10,
    totalTestTrades: 50,
    testSharpe: 1.5,
    testMaxDrawdown: 0.08,
    testProfitFactor: 1.8,
    testTotalPnl: 0.35,
    cumulativeEquity: [
      { timestamp: '2025-01-01T00:00:00Z', equity: 1.0 },
      { timestamp: '2025-01-02T00:00:00Z', equity: 1.1 },
      { timestamp: '2025-01-03T00:00:00Z', equity: 1.2 },
      { timestamp: '2025-01-04T00:00:00Z', equity: 1.35 },
    ],
    ...overrides,
  };
}

function createProfitableTrades(count = 20, netProfitBps = 30): BacktestTrade[] {
  // netProfitBps per trade after 14 bps baseline cost
  // gross profit = (netProfitBps + 14) bps
  const netPnlFraction = netProfitBps / 10000;
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
    tokenId: i % 2 === 0 ? 'TREND_UP' : 'RANGE',
    side: 'BUY' as const,
    price: 100,
    size: 1,
    pnl: netPnlFraction,
  }));
}

const mockConfig: ExperimentConfig = {
  familyId: 'momentum-breakout',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  lookback: 20,
  tp: 0.02,
  sl: 0.01,
  maxHolding: 12,
  regimes: ['TREND_UP', 'RANGE'],
  split: {
    mode: 'rolling',
    trainRatio: 0.6,
    valRatio: 0.2,
    testRatio: 0.2,
    stepSize: 0.1,
  },
  cost: {
    feeBps: 5,
    slippageBps: 2,
  },
};

describe('Milestone 1 Empirical Challenger: Boundary Conditions', () => {
  it('Sharpe boundary: rejects 0.999, passes 1.000, passes 1.001', () => {
    const trades = createProfitableTrades(20, 60);

    // 1. Sharpe = 0.999 (sub-hurdle)
    const summaryFail = createRobustSummary({ testSharpe: 0.999 });
    const resultFail = evaluateAlphaSurvivalGate({ summary: summaryFail, trades });
    expect(resultFail.passed).toBe(false);
    expect(resultFail.checks.sharpePassed).toBe(false);
    expect(resultFail.sharpeRatio).toBe(0.999);
    expect(resultFail.failures.some((f) => f.includes('OOS Sharpe ratio of 1.00 is below hurdle rate 1.00'))).toBe(true);

    const diagnostics = generateCandidateRejectionDiagnostics(resultFail, summaryFail, mockConfig);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].metric).toBe('oos_sharpe_ratio');
    expect(diagnostics[0].value).toBe(0.999);
    expect(diagnostics[0].threshold).toBe(1.0);
    expect(Math.abs(diagnostics[0].value - diagnostics[0].threshold)).toBeCloseTo(0.001, 6);

    // 2. Sharpe = 1.000 (exact hurdle)
    const summaryExact = createRobustSummary({ testSharpe: 1.000 });
    const resultExact = evaluateAlphaSurvivalGate({ summary: summaryExact, trades });
    expect(resultExact.checks.sharpePassed).toBe(true);
    expect(resultExact.passed).toBe(true);

    // 3. Sharpe = 1.001 (above hurdle)
    const summaryPass = createRobustSummary({ testSharpe: 1.001 });
    const resultPass = evaluateAlphaSurvivalGate({ summary: summaryPass, trades });
    expect(resultPass.checks.sharpePassed).toBe(true);
    expect(resultPass.passed).toBe(true);
  });

  it('Max Drawdown boundary: rejects 0.151, passes 0.150, passes 0.149 (positive and negative sign)', () => {
    const trades = createProfitableTrades(20, 60);

    // 1. Positive 0.151 (breach)
    const summaryFailPos = createRobustSummary({ testMaxDrawdown: 0.151 });
    const resultFailPos = evaluateAlphaSurvivalGate({ summary: summaryFailPos, trades });
    expect(resultFailPos.passed).toBe(false);
    expect(resultFailPos.checks.drawdownPassed).toBe(false);
    expect(resultFailPos.maxDrawdown).toBe(0.151);

    const diagPos = generateCandidateRejectionDiagnostics(resultFailPos, summaryFailPos, mockConfig);
    expect(diagPos).toHaveLength(1);
    expect(diagPos[0].metric).toBe('max_drawdown');
    expect(diagPos[0].value).toBe(0.151);
    expect(diagPos[0].threshold).toBe(0.15);
    expect(Math.abs(diagPos[0].value - diagPos[0].threshold)).toBeCloseTo(0.001, 6);
    expect(diagPos[0].refinementHypothesis).toBe('Drawdown Reduction');

    // 2. Negative -0.151 (breach under negative convention)
    const summaryFailNeg = createRobustSummary({ testMaxDrawdown: -0.151 });
    const resultFailNeg = evaluateAlphaSurvivalGate({ summary: summaryFailNeg, trades });
    expect(resultFailNeg.passed).toBe(false);
    expect(resultFailNeg.checks.drawdownPassed).toBe(false);
    expect(resultFailNeg.maxDrawdown).toBe(0.151);

    // 3. Exactly 0.150 (exact ceiling)
    const summaryExactPos = createRobustSummary({ testMaxDrawdown: 0.150 });
    const resultExactPos = evaluateAlphaSurvivalGate({ summary: summaryExactPos, trades });
    expect(resultExactPos.checks.drawdownPassed).toBe(true);
    expect(resultExactPos.passed).toBe(true);

    const summaryExactNeg = createRobustSummary({ testMaxDrawdown: -0.150 });
    const resultExactNeg = evaluateAlphaSurvivalGate({ summary: summaryExactNeg, trades });
    expect(resultExactNeg.checks.drawdownPassed).toBe(true);
    expect(resultExactNeg.passed).toBe(true);

    // 4. Positive and negative 0.149 (within ceiling)
    const summaryPassPos = createRobustSummary({ testMaxDrawdown: 0.149 });
    const resultPassPos = evaluateAlphaSurvivalGate({ summary: summaryPassPos, trades });
    expect(resultPassPos.checks.drawdownPassed).toBe(true);
    expect(resultPassPos.passed).toBe(true);

    const summaryPassNeg = createRobustSummary({ testMaxDrawdown: -0.149 });
    const resultPassNeg = evaluateAlphaSurvivalGate({ summary: summaryPassNeg, trades });
    expect(resultPassNeg.checks.drawdownPassed).toBe(true);
    expect(resultPassNeg.passed).toBe(true);
  });

  it('Cost stress: rejects negative expectancy under 20 bps (conservative) and 50 bps (adverse)', () => {
    const summary = createRobustSummary();

    // Baseline: feeBps=5, slippageBps=2 per side => 14 bps round trip (0.0014)
    // 1. Fee trap: gross edge is 18 bps (0.0018). Net under 14 bps is +4 bps (0.0004).
    // Under conservative (20 bps round trip): consPnl = 18 - 20 = -2 bps (-0.0002).
    const tradesFeeTrap: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY' as const,
      price: 100,
      size: 1,
      pnl: 0.0004,
    }));

    const resultFeeTrap = evaluateAlphaSurvivalGate({ summary, trades: tradesFeeTrap });
    expect(resultFeeTrap.passed).toBe(false);
    expect(resultFeeTrap.checks.costStressConservativePassed).toBe(false);
    expect(resultFeeTrap.checks.costStressAdversePassed).toBe(false);
    expect(resultFeeTrap.conservativePnl).toBeLessThan(0);
    expect(resultFeeTrap.adversePnl).toBeLessThan(0);

    const diagsFeeTrap = generateCandidateRejectionDiagnostics(resultFeeTrap, summary, mockConfig);
    const consDiag = diagsFeeTrap.find((d) => d.metric === 'cost_stress_conservative');
    const advDiag = diagsFeeTrap.find((d) => d.metric === 'cost_stress_adverse');
    expect(consDiag).toBeDefined();
    expect(consDiag?.refinementHypothesis).toBe('Trade Frequency Reduction');
    expect(advDiag).toBeDefined();
    expect(advDiag?.refinementHypothesis).toBe('Execution Hurdle & Volatility Filter');

    // 2. Survives 20 bps but fails 50 bps:
    // Gross edge = 35 bps. Net under 14 bps is +21 bps (0.0021).
    // Under 20 bps: +15 bps (0.0015). Under 50 bps: -15 bps (-0.0015).
    const tradesAdverseFail: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY' as const,
      price: 100,
      size: 1,
      pnl: 0.0021,
    }));

    const resultAdv = evaluateAlphaSurvivalGate({ summary, trades: tradesAdverseFail });
    expect(resultAdv.passed).toBe(false);
    expect(resultAdv.checks.costStressConservativePassed).toBe(true);
    expect(resultAdv.checks.costStressAdversePassed).toBe(false);
    expect(resultAdv.conservativePnl).toBeGreaterThan(0);
    expect(resultAdv.adversePnl).toBeLessThan(0);

    const diagsAdv = generateCandidateRejectionDiagnostics(resultAdv, summary, mockConfig);
    expect(diagsAdv).toHaveLength(1);
    expect(diagsAdv[0].metric).toBe('cost_stress_adverse');
    expect(diagsAdv[0].refinementHypothesis).toBe('Execution Hurdle & Volatility Filter');
    expect(diagsAdv[0].threshold).toBe(0.0);
    expect(diagsAdv[0].value).toBe(resultAdv.adversePnl);
    expect(diagsAdv[0].value).toBeLessThan(0);

    // 3. Exactly zero PnL under cost stress: strict inequality (> 0) required
    // Gross edge = 20 bps (0.0020). Net under 14 bps is +6 bps (0.0006).
    // Under 20 bps: consPnl = 20 - 20 = 0.
    const tradesZeroCons: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY' as const,
      price: 100,
      size: 1,
      pnl: 0.0006,
    }));

    const resultZero = evaluateAlphaSurvivalGate({ summary, trades: tradesZeroCons });
    expect(resultZero.conservativePnl).toBe(0);
    expect(resultZero.checks.costStressConservativePassed).toBe(false);
    expect(resultZero.passed).toBe(false);
  });
});

describe('Milestone 1 Empirical Challenger: Diagnostic Discrepancies & Precision', () => {
  it('correctly maps all 4 failure modes simultaneously with exact discrepancies', () => {
    const summary = createRobustSummary({
      testSharpe: 0.45,
      testMaxDrawdown: 0.28,
      regimeConsistencyScore: 0.35,
      testWinRate: 0.30,
      testProfitFactor: 0.85,
    });

    // Trades with negative gross PnL
    const trades: BacktestTrade[] = Array.from({ length: 15 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'SHOCK',
      side: 'BUY' as const,
      price: 100,
      size: 1,
      pnl: -0.005,
    }));

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades });
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.sharpePassed).toBe(false);
    expect(gateResult.checks.drawdownPassed).toBe(false);
    expect(gateResult.checks.regimeConsistencyPassed).toBe(false);
    expect(gateResult.checks.costStressConservativePassed).toBe(false);
    expect(gateResult.checks.costStressAdversePassed).toBe(false);

    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    // Should have 5 diagnostics: sharpe, maxDD, regime, cost_conservative, cost_adverse
    expect(diagnostics).toHaveLength(5);

    const metricNames = diagnostics.map((d) => d.metric);
    expect(metricNames).toContain('oos_sharpe_ratio');
    expect(metricNames).toContain('max_drawdown');
    expect(metricNames).toContain('regime_consistency_score');
    expect(metricNames).toContain('cost_stress_conservative');
    expect(metricNames).toContain('cost_stress_adverse');

    // Verify mathematical discrepancy properties
    for (const d of diagnostics) {
      expect(typeof d.value).toBe('number');
      expect(typeof d.threshold).toBe('number');
      expect(Number.isFinite(d.value)).toBe(true);
      expect(Number.isFinite(d.threshold)).toBe(true);
      expect(d.reason.length).toBeGreaterThan(10);
      expect(d.refinementHypothesis.length).toBeGreaterThan(0);
    }

    const sharpeDiag = diagnostics.find((d) => d.metric === 'oos_sharpe_ratio')!;
    expect(sharpeDiag.value).toBe(0.45);
    expect(sharpeDiag.threshold).toBe(1.0);
    expect(sharpeDiag.threshold - sharpeDiag.value).toBeCloseTo(0.55, 6);
    expect(sharpeDiag.refinementHypothesis).toBe('Profit Factor Improvement'); // winRate < 0.5 & profitFactor < 1.3

    const ddDiag = diagnostics.find((d) => d.metric === 'max_drawdown')!;
    expect(ddDiag.value).toBe(0.28);
    expect(ddDiag.threshold).toBe(0.15);
    expect(ddDiag.value - ddDiag.threshold).toBeCloseTo(0.13, 6);

    const regimeDiag = diagnostics.find((d) => d.metric === 'regime_consistency_score')!;
    expect(regimeDiag.value).toBe(0.35);
    expect(regimeDiag.threshold).toBe(0.50);
    expect(regimeDiag.threshold - regimeDiag.value).toBeCloseTo(0.15, 6);
  });

  it('returns empty diagnostics when candidate passes all gates', () => {
    const summary = createRobustSummary();
    const trades = createProfitableTrades(20, 60);
    const gateResult = evaluateAlphaSurvivalGate({ summary, trades });
    expect(gateResult.passed).toBe(true);

    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    expect(diagnostics).toEqual([]);
  });
});

describe('Milestone 1 Empirical Challenger: Edge Cases (0 trades, 1 trade, 0% WR, 100% WR)', () => {
  it('Edge Case 1: Empty trades array (0 trades)', () => {
    // Both trades empty and summary testTotalTrades = 0
    const summary = createRobustSummary({
      totalTestTrades: 0,
      testTotalPnl: 0,
      testSharpe: 0,
      cumulativeEquity: [],
    });

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: [] });

    // With 0 trades, candidate MUST NOT pass survival gates
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.costStressConservativePassed).toBe(false);
    expect(gateResult.checks.costStressAdversePassed).toBe(false);
    expect(gateResult.conservativePnl).toBe(0);
    expect(gateResult.adversePnl).toBe(0);

    // Diagnostics must not crash
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const d of diagnostics) {
      expect(Number.isNaN(d.value)).toBe(false);
      expect(Number.isNaN(d.threshold)).toBe(false);
    }
  });

  it('Edge Case 2: Single trade (1 trade winning)', () => {
    const summary = createRobustSummary({
      totalTestTrades: 1,
      testTotalPnl: 0.05,
      testSharpe: 1.2,
      testMaxDrawdown: 0.02,
      regimeConsistencyScore: 1.0,
      testWinRate: 1.0,
      testProfitFactor: Infinity,
    });

    const singleWinningTrade: BacktestTrade[] = [
      {
        timestamp: new Date(1700000000000).toISOString(),
        tokenId: 'TREND_UP',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: 0.05, // 500 bps profit
      },
    ];

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: singleWinningTrade });
    // Cost stress with 1 trade: gross = 0.05 + 0.0014 = 0.0514.
    // Under 20 bps: 0.0514 - 0.0020 = 0.0494 > 0.
    // Under 50 bps: 0.0514 - 0.0050 = 0.0464 > 0.
    expect(gateResult.checks.costStressConservativePassed).toBe(true);
    expect(gateResult.checks.costStressAdversePassed).toBe(true);
    expect(gateResult.checks.sharpePassed).toBe(true);
    expect(gateResult.checks.drawdownPassed).toBe(true);
    expect(gateResult.checks.regimeConsistencyPassed).toBe(true);
    expect(gateResult.passed).toBe(true);

    // Should generate 0 rejection diagnostics
    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    expect(diagnostics).toHaveLength(0);
  });

  it('Edge Case 2b: Single trade (1 trade losing)', () => {
    const summary = createRobustSummary({
      totalTestTrades: 1,
      testTotalPnl: -0.02,
      testSharpe: 0,
      testMaxDrawdown: 0.02,
      regimeConsistencyScore: 0,
      testWinRate: 0,
      testProfitFactor: 0,
    });

    const singleLosingTrade: BacktestTrade[] = [
      {
        timestamp: new Date(1700000000000).toISOString(),
        tokenId: 'TREND_UP',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: -0.02,
      },
    ];

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: singleLosingTrade });
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.costStressConservativePassed).toBe(false);
    expect(gateResult.checks.costStressAdversePassed).toBe(false);

    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('Edge Case 3: Zero win rate (0% win rate, all losses)', () => {
    const summary = createRobustSummary({
      testWinRate: 0.0,
      testProfitFactor: 0.0,
      testSharpe: -0.8,
      testTotalPnl: -0.15,
      totalTestTrades: 20,
    });

    const allLosingTrades: BacktestTrade[] = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(1700000000000 + i * 3600000).toISOString(),
      tokenId: 'RANGE',
      side: 'BUY' as const,
      price: 100,
      size: 1,
      pnl: -0.0075,
    }));

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: allLosingTrades });
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.sharpePassed).toBe(false);

    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    const sharpeDiag = diagnostics.find((d) => d.metric === 'oos_sharpe_ratio');
    expect(sharpeDiag).toBeDefined();
    // Since winRate < 0.5 and profitFactor < 1.3 (profitFactor is 0), selects Profit Factor Improvement
    expect(sharpeDiag?.refinementHypothesis).toBe('Profit Factor Improvement');
    expect(sharpeDiag?.details?.recommendedParamChanges?.takeProfitBps).toBeDefined();
  });

  it('Edge Case 4: 100% win rate (all wins, profitFactor = Infinity)', () => {
    const summary = createRobustSummary({
      testWinRate: 1.0,
      testProfitFactor: Infinity,
      testSharpe: 0.95, // Sub-hurdle Sharpe despite 100% win rate (e.g. tiny gains)
      testTotalPnl: 0.02,
      totalTestTrades: 20,
    });

    const allWinningTrades = createProfitableTrades(20, 60);

    const gateResult = evaluateAlphaSurvivalGate({ summary, trades: allWinningTrades });
    expect(gateResult.passed).toBe(false);
    expect(gateResult.checks.sharpePassed).toBe(false);

    const diagnostics = generateCandidateRejectionDiagnostics(gateResult, summary, mockConfig);
    const sharpeDiag = diagnostics.find((d) => d.metric === 'oos_sharpe_ratio');
    expect(sharpeDiag).toBeDefined();
    // With winRate >= 0.50 (here 1.0), selects Stop-Loss Tightening hypothesis
    expect(sharpeDiag?.refinementHypothesis).toBe('Stop-Loss Tightening');
    expect(sharpeDiag?.details?.recommendedParamChanges?.stopLossBps).toBeDefined();
    expect(Number.isFinite(sharpeDiag?.details?.recommendedParamChanges?.stopLossBps as number)).toBe(true);
  });

  it('Edge Case 5: Summary-only fallback when trade records are omitted', () => {
    // Input without trades array, but summary has positive PnL and totalTestTrades
    const summary = createRobustSummary({
      totalTestTrades: 20,
      testTotalPnl: 0.10, // 10% total net PnL across 20 trades = 50 bps avg per trade
      testSharpe: 1.6,
      testMaxDrawdown: 0.05,
      regimeConsistencyScore: 0.75,
    });

    const gateResult = evaluateAlphaSurvivalGate({ summary });
    expect(gateResult.checks.sharpePassed).toBe(true);
    expect(gateResult.checks.drawdownPassed).toBe(true);
    expect(gateResult.checks.regimeConsistencyPassed).toBe(true);
    expect(gateResult.checks.costStressConservativePassed).toBe(true);
    expect(gateResult.checks.costStressAdversePassed).toBe(true);
    expect(gateResult.passed).toBe(true);
  });
});
