/**
 * Alpha CLI Tests
 *
 * Tests for the `cashclaw alpha` subcommand group:
 *   - candidates lists configs
 *   - backtest <valid-config> produces output
 *   - compare a b produces a comparison
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock commander so we can invoke commands without process.exit side-effects
vi.mock('commander', async (importOriginal) => {
  const actual = await importOriginal<typeof import('commander')>();
  return {
    ...actual,
    Command: actual.Command,
  };
});

// Mock fs so we don't touch the real filesystem
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => ['rsi-mean-reversion.json', 'volume-breakout.json', 'multi-factor-momentum.json']),
    readFileSync: vi.fn((p: string) => {
      if (p.includes('rsi-mean-reversion')) {
        return JSON.stringify({
          experimentId: 'rsi-mean-reversion-btc-1h',
          hypothesis: 'test',
          symbol: 'BTC/USD',
          timeframe: '1h',
          features: ['momentum', 'ma_distance', 'atr'],
          regimes: ['RANGE'],
          tp: 0.015,
          sl: 0.008,
          maxHolding: 12,
          lookback: 20,
          split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
          cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
          seed: 42,
          gitCommit: 'HEAD',
          createdAt: '2026-08-16T00:00:00Z',
        });
      }
      if (p.includes('volume-breakout')) {
        return JSON.stringify({
          experimentId: 'volume-breakout-eth-4h',
          hypothesis: 'test',
          symbol: 'ETH/USD',
          timeframe: '4h',
          features: ['volume_zscore', 'relative_volume'],
          regimes: ['TREND_UP'],
          tp: 0.03,
          sl: 0.015,
          maxHolding: 6,
          lookback: 30,
          split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
          cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
          seed: 123,
          gitCommit: 'HEAD',
          createdAt: '2026-08-16T00:00:00Z',
        });
      }
      if (p.includes('multi-factor-momentum')) {
        return JSON.stringify({
          experimentId: 'multi-factor-momentum-sol-4h',
          hypothesis: 'test',
          symbol: 'SOL/USD',
          timeframe: '4h',
          features: ['momentum', 'ma_distance'],
          regimes: ['TREND_UP'],
          tp: 0.02,
          sl: 0.01,
          maxHolding: 8,
          lookback: 25,
          split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
          cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
          seed: 99,
          gitCommit: 'HEAD',
          createdAt: '2026-08-16T00:00:00Z',
        });
      }
      return '{}';
    }),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    dirname: vi.fn(() => '.'),
  };
});

// Mock the logger so we can capture output (path as resolved from the test file)
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock loadCandles to return deterministic mock data (path as in alpha-commands.ts).
// The real buildDataSources is kept — it is a pure function and the handlers
// under test consume its output.
vi.mock('../../../alpha-lab/experiments/alpha-backtest-adapter', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../alpha-lab/experiments/alpha-backtest-adapter')>();
  return {
    ...actual,
    loadCandles: vi.fn(async () => {
      const candles = [];
      for (let i = 0; i < 600; i++) {
        const close = 100 + Math.sin(i / 10) * 2 + i * 0.01;
        candles.push({
          timestamp: new Date(Date.UTC(2024, 0, 1, i)).toISOString(),
          open: close - 0.5,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1000 + i,
        });
      }
      return { candles, source: 'mock' as const };
    }),
  };
});

// Mock experiment-engine
vi.mock('../../../alpha-lab/experiments/experiment-engine', () => ({
  runExperiment: vi.fn(({ config }) => ({
    config,
    steps: [],
    metrics: {
      train: { numTrades: 5, winRate: 0.6, lossRate: 0.2, timeoutRate: 0.2, meanLabel: 0.4, regimesPresent: [], totalPnl: 0.02, sharpeRatio: 1.2, profitFactor: 1.5, maxDrawdown: -0.05 },
      val: { numTrades: 3, winRate: 0.55, lossRate: 0.25, timeoutRate: 0.2, meanLabel: 0.3, regimesPresent: [], totalPnl: 0.01, sharpeRatio: 0.9, profitFactor: 1.2, maxDrawdown: -0.04 },
      test: { numTrades: 4, winRate: 0.52, lossRate: 0.28, timeoutRate: 0.2, meanLabel: 0.2, regimesPresent: [], totalPnl: 0.008, sharpeRatio: 0.8, profitFactor: 1.1, maxDrawdown: -0.03 },
    },
    totalBars: 600,
    numSteps: 1,
  })),
}));

// Mock baseline-runner
vi.mock('../../../alpha-lab/baselines/baseline-runner', () => ({
  runAllBaselines: vi.fn(() => [
    { name: 'buy-and-hold', report: { sharpeRatio: 0.5, winRate: 0.4, totalPnl: -0.01 } },
    { name: 'random-entry', report: { sharpeRatio: 0.1, winRate: 0.45, totalPnl: -0.02 } },
    { name: 'simple-momentum', report: { sharpeRatio: 0.3, winRate: 0.48, totalPnl: 0.005 } },
    { name: 'simple-mean-reversion', report: { sharpeRatio: 0.2, winRate: 0.47, totalPnl: -0.005 } },
  ]),
}));

// Mock walkforward-evaluator
vi.mock('../../../alpha-lab/walkforward/walkforward-evaluator', () => ({
  evaluateWalkForward: vi.fn(({ config }) => ({
    steps: [
      { step: 0, trainMetrics: { sharpeRatio: 1.0, winRate: 0.6, numTrades: 3 }, valMetrics: { sharpeRatio: 0.8, winRate: 0.55, numTrades: 2 }, testMetrics: { sharpeRatio: 0.7, winRate: 0.5, numTrades: 2 } },
    ],
    summary: { totalSteps: 1, trainWinRate: 0.6, valWinRate: 0.55, testWinRate: 0.5, overfitGap: 0.1, consistencyScore: 0.5, avgTestTrades: 2, totalTestTrades: 2 },
  })),
}));

import { Command } from 'commander';
import { registerAlphaCommands } from '../alpha-commands';
import { logger } from '../../../shared/utils/logger';

function createAlphaCmd(): Command {
  const cmd = new Command();
  cmd.name('alpha').description('Alpha Discovery Engine');
  registerAlphaCommands(cmd);
  return cmd;
}

async function runCommand(cmd: Command, args: string[]): Promise<void> {
  await cmd.parseAsync(['node', 'test', ...args]);
}

describe('alpha candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all experiment configs from alpha-lab/configs/', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['candidates']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('volume-breakout-eth-4h');
    expect(allOutput).toContain('multi-factor-momentum-sol-4h');
  });

  it('supports --json flag for machine-readable output', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['candidates', '--json']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(Array.isArray(parsed.configs)).toBe(true);
    expect(parsed.configs.length).toBe(3);
    expect(Array.isArray(parsed.baselines)).toBe(true);
    expect(parsed.baselines).toContain('buy-and-hold');
  });
});

describe('alpha backtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces output for a valid experiment config', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['backtest', 'rsi-mean-reversion-btc-1h']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Backtest:');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('train');
    expect(allOutput).toContain('val');
    expect(allOutput).toContain('test');
  });

  it('exits non-zero for unknown experiment', async () => {
    const cmd = createAlphaCmd();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await runCommand(cmd, ['backtest', 'nonexistent-experiment']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('supports --json flag', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['backtest', 'rsi-mean-reversion-btc-1h', '--json']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.experimentId).toBe('rsi-mean-reversion-btc-1h');
    expect(parsed.train).toBeDefined();
    expect(parsed.val).toBeDefined();
    expect(parsed.test).toBeDefined();
  });
});

describe('alpha compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces a side-by-side comparison for two experiments', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, [
      'compare',
      'rsi-mean-reversion-btc-1h',
      'volume-breakout-eth-4h',
    ]);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Compare:');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('volume-breakout-eth-4h');
    expect(allOutput).toContain('Winner');
  });

  it('supports --json flag', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, [
      'compare',
      'rsi-mean-reversion-btc-1h',
      'volume-breakout-eth-4h',
      '--json',
    ]);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.experimentA).toBe('rsi-mean-reversion-btc-1h');
    expect(parsed.experimentB).toBe('volume-breakout-eth-4h');
    expect(Array.isArray(parsed.metrics)).toBe(true);
    expect(parsed.metrics.length).toBeGreaterThan(0);
  });
});