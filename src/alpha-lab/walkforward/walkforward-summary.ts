/**
 * Walk-Forward Summary Aggregation
 */

import type { CandleLike } from '../regimes/regime-types';
import { computeSharpeRatio, computeMaxDrawdown, computeProfitFactor } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import { buildEquityCurve } from '../shared/equity-curve';
import type { StepResult, WalkForwardSummary } from './walkforward-types';

export function buildSummary(
  steps: StepResult[],
  allTestTradesInput?: BacktestTrade[],
  testCandles?: CandleLike[],
): WalkForwardSummary {
  if (steps.length === 0) {
    return {
      totalSteps: 0,
      trainWinRate: 0,
      valWinRate: 0,
      testWinRate: 0,
      overfitGap: 0,
      consistencyScore: 0,
      regimeConsistencyScore: 0,
      avgTestTrades: 0,
      totalTestTrades: 0,
      testSharpe: 0,
      testMaxDrawdown: 0,
      testProfitFactor: 0,
      testTotalPnl: 0,
      cumulativeEquity: [],
    };
  }

  const allTestTrades = allTestTradesInput ?? steps.flatMap((s) => s.testTrades ?? []);
  const trainWR = steps.reduce((s, x) => s + x.trainMetrics.winRate, 0) / steps.length;
  const valWR = steps.reduce((s, x) => s + x.valMetrics.winRate, 0) / steps.length;
  const testWR = steps.reduce((s, x) => s + x.testMetrics.winRate, 0) / steps.length;
  const overfit = trainWR - testWR;
  const consistency = steps.filter((x) => x.testMetrics.winRate > 0.5).length / steps.length;
  const avgTrades = steps.reduce((s, x) => s + x.testMetrics.numTrades, 0) / steps.length;
  const totalTrades = steps.reduce((s, x) => s + x.testMetrics.numTrades, 0);

  const testTotalPnl = allTestTrades.length > 0
    ? Math.round(allTestTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0) * 10000) / 10000
    : Math.round(steps.reduce((sum, s) => sum + s.testMetrics.totalPnl, 0) * 10000) / 10000;

  const testProfitFactor = allTestTrades.length > 0 ? computeProfitFactor(allTestTrades) : 0;

  // Stitched cumulative equity curve across test splits
  let cumulativeEquity: Array<{ timestamp: string; equity: number }> = [];
  if (testCandles && testCandles.length > 0) {
    cumulativeEquity = buildEquityCurve(testCandles, allTestTrades);
  } else if (allTestTrades.length > 0) {
    const tradeTimestamps = Array.from(new Set(allTestTrades.map((t) => t.timestamp)))
      .sort()
      .map((ts) => ({ timestamp: ts }));
    cumulativeEquity = buildEquityCurve(tradeTimestamps, allTestTrades);
  }

  const testSharpe = cumulativeEquity.length >= 2 ? computeSharpeRatio(cumulativeEquity) : 0;
  const rawMaxDrawdown = cumulativeEquity.length >= 2 ? computeMaxDrawdown(cumulativeEquity) : 0;
  const testMaxDrawdown = Math.round(Math.abs(rawMaxDrawdown) * 10000) / 10000;

  // Regime consistency score: fraction of distinct test regimes exhibiting positive out-of-sample PnL
  let regimeConsistencyScore = 0;
  const regimePnl = new Map<string, number>();
  for (const t of allTestTrades) {
    const reg = t.tokenId || 'UNKNOWN';
    regimePnl.set(reg, (regimePnl.get(reg) ?? 0) + (t.pnl ?? 0));
  }

  if (regimePnl.size > 0) {
    const profitableRegimes = Array.from(regimePnl.values()).filter((pnl) => pnl > 0).length;
    regimeConsistencyScore = Math.round((profitableRegimes / regimePnl.size) * 100) / 100;
  } else if (steps.length > 0) {
    regimeConsistencyScore = consistency;
  }

  return {
    totalSteps: steps.length,
    trainWinRate: trainWR,
    valWinRate: valWR,
    testWinRate: testWR,
    overfitGap: overfit,
    consistencyScore: consistency,
    regimeConsistencyScore,
    avgTestTrades: avgTrades,
    totalTestTrades: totalTrades,
    testSharpe,
    testMaxDrawdown,
    testProfitFactor,
    testTotalPnl,
    cumulativeEquity,
  };
}
