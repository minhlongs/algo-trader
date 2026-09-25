/**
 * Test Helpers & Mock Fixtures for Alpha-Lab Testing
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BacktestTrade } from '../../src/desk/backtesting/types';
import type { CandidateResult } from '../../src/alpha-lab/attribution/alpha-evaluator';
import type { GateEvaluatorInput } from '../../src/alpha-lab/gates/gate-evaluator-types';
import type { EvaluationReport } from '../../src/alpha-lab/evaluation/evaluation-types';

/**
 * Creates a dedicated isolated temporary directory for test file I/O.
 */
export async function createTempDir(prefix = 'alpha-lab-test-'): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return {
    path: dir,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    },
  };
}

/**
 * Creates a synthetic sequence of BacktestTrades for metrics testing.
 */
export function makeSyntheticTrades(
  count = 50,
  winRate = 0.6,
  profitPerWin = 200,
  lossPerLoss = -100,
  baseTime = Date.parse('2025-01-01T00:00:00.000Z'),
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const winsCount = Math.round(count * winRate);

  for (let i = 0; i < count; i++) {
    const isWin = i < winsCount;
    const entryTime = baseTime + i * 3600 * 1000 * 4; // 4 hours apart
    const exitTime = entryTime + 3600 * 1000;
    const pnl = isWin ? profitPerWin : lossPerLoss;
    const entryPrice = 50000;
    const exitPrice = isWin ? 50200 : 49900;
    const isoTimestamp = new Date(exitTime).toISOString();

    trades.push({
      timestamp: isoTimestamp,
      entryTime,
      exitTime,
      side: 'buy',
      entryPrice,
      exitPrice,
      size: 1,
      pnl,
      fee: 5,
      slippage: 2,
    });
  }
  return trades;
}

/**
 * Creates a candidate result conforming to CandidateResult interface.
 */
export function makeCandidateResult(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    name: 'test-experiment-001',
    totalTrades: 60,
    winRate: 0.62,
    sharpeRatio: 1.65,
    profitFactor: 1.85,
    maxDrawdown: 0.08,
    totalNetPnl: 4500,
    ...overrides,
  };
}

/**
 * Creates a valid EvaluationReport conforming to evaluation-types.ts.
 */
export function makeEvaluationReport(overrides: Partial<EvaluationReport['overall']> = {}): EvaluationReport {
  return {
    overall: {
      totalTrades: 60,
      winningTrades: 38,
      losingTrades: 22,
      winRate: 0.6333,
      lossRate: 0.3667,
      profitFactor: 1.85,
      avgPnlPerTrade: 75,
      totalNetPnl: 4500,
      maxDrawdown: 0.08,
      sharpeRatio: 1.65,
      ...overrides,
    },
    byRegime: [
      { regime: 'TREND_UP', numTrades: 30, winRate: 0.70, lossRate: 0.30, meanLabel: 0.05, netPnl: 3500 },
      { regime: 'RANGE', numTrades: 30, winRate: 0.50, lossRate: 0.50, meanLabel: 0.01, netPnl: 1000 },
    ],
    byMonth: [
      { month: '2025-01', numTrades: 60, winRate: 0.6333, netPnl: 4500 },
    ],
    byVolatilityBucket: [
      { bucket: 'medium', numTrades: 60, winRate: 0.6333, netPnl: 4500 },
    ],
  };
}

/**
 * Creates sample GateEvaluatorInput for statistical gate evaluation.
 */
export function makeGateEvaluatorInput(overrides: Partial<GateEvaluatorInput> = {}): GateEvaluatorInput {
  const trades = makeSyntheticTrades(60, 0.65, 250, -100);
  const startDate = new Date(Date.now() - 35 * 86400 * 1000).toISOString(); // 35 days ago
  const equityCurve = trades.map((t, idx) => ({
    timestamp: t.timestamp,
    equity: 1.0 + idx * 0.01,
  }));

  return {
    trades,
    startDate,
    equityCurve,
    testWinRate: 0.65,
    valWinRate: 0.63,
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
    statisticalValidation: {
      pValueSharpe: 0.02,
      sharpeCiLower: 1.1,
    },
    ...overrides,
  };
}
