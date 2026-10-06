import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleTradeBacktest } from '../../../../src/desk/cli/cashclaw-trade-backtest-handler';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockRunnerRun = vi.fn();
const mockClearCache = vi.fn();

vi.mock('../../../../src/desk/backtesting/backtest-runner', () => ({
  BacktestRunner: class MockBacktestRunner {
    run = mockRunnerRun;
    clearCache = mockClearCache;
  },
}));

vi.mock('../../../../src/desk/polymarket/strategy-registry', () => ({
  listStrategies: vi.fn().mockReturnValue([
    { name: 'spread-mean-reversion', description: 'Spread strategy' },
  ]),
}));

describe('cashclaw-trade-backtest-handler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('prints formatted box table when format is table or text (default non-silent)', async () => {
    mockRunnerRun.mockResolvedValue({
      strategy: 'spread-mean-reversion',
      trades: [],
      durationMs: 1500,
      warnings: [],
      metrics: {
        sharpeRatio: 1.85,
        maxDrawdown: 0.05,
        winRate: 0.65,
        profitFactor: 2.1,
        totalPnl: -15.5, // Negative PnL test
        avgPnlPerTrade: -1.25,
        totalTrades: 20,
        winningTrades: 13,
        losingTrades: 7,
        bestTrade: 50.0,
        worstTrade: -35.2,
      },
    });

    await handleTradeBacktest({
      strategy: 'spread-mean-reversion',
      days: '30',
      capital: '5000',
      format: 'table',
    });

    const infoCalls = vi.mocked(logger.info).mock.calls.map((c) => c[0]);

    // Verify box table borders are printed (proving it is NOT silent)
    expect(infoCalls.some((c) => typeof c === 'string' && c.startsWith('┌─'))).toBe(true);
    expect(infoCalls.some((c) => typeof c === 'string' && c.startsWith('└─'))).toBe(true);

    // Verify negative PnL is formatted as -$X.XX instead of $-X.XX
    const pnlRow = infoCalls.find((c) => typeof c === 'string' && c.includes('Total P&L'));
    expect(pnlRow).toBeDefined();
    expect(pnlRow).toContain('-$15.50');
    expect(pnlRow).not.toContain('$-15.50');
    expect(pnlRow).toContain('-$1.25');

    const worstRow = infoCalls.find((c) => typeof c === 'string' && c.includes('Worst:'));
    expect(worstRow).toBeDefined();
    expect(worstRow).toContain('-$35.20');
    expect(worstRow).not.toContain('$-35.20');

    expect(mockClearCache).toHaveBeenCalled();
  });

  it('prints JSON output when format is json', async () => {
    mockRunnerRun.mockResolvedValue({
      strategy: 'spread-mean-reversion',
      trades: [],
      durationMs: 1200,
      warnings: ['Low liquidity'],
      metrics: {
        sharpeRatio: 2.1,
        maxDrawdown: 0.02,
        winRate: 0.8,
        profitFactor: 3.0,
        totalPnl: 100.0,
        avgPnlPerTrade: 10.0,
        totalTrades: 10,
        winningTrades: 8,
        losingTrades: 2,
        bestTrade: 25.0,
        worstTrade: -5.0,
      },
    });

    await handleTradeBacktest({
      strategy: 'spread-mean-reversion',
      days: '14',
      capital: '1000',
      format: 'json',
    });

    const infoCalls = vi.mocked(logger.info).mock.calls.map((c) => c[0]);
    const jsonCall = infoCalls.find((c) => {
      try {
        JSON.parse(String(c));
        return true;
      } catch {
        return false;
      }
    });

    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(String(jsonCall));
    expect(parsed.strategy).toBe('spread-mean-reversion');
    expect(parsed.metrics.totalPnl).toBe(100.0);
    expect(parsed.warnings).toEqual(['Low liquidity']);
  });

  it('exits with error on unknown strategy', async () => {
    await handleTradeBacktest({
      strategy: 'non-existent-strat',
      days: '7',
      capital: '1000',
      format: 'table',
    });

    expect(logger.error).toHaveBeenCalledWith('Unknown strategy: non-existent-strat');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
