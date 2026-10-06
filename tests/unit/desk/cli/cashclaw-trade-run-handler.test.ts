import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleTradeRun } from '../../../../src/desk/cli/cashclaw-trade-run-handler';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../src/desk/polymarket/strategy-registry', () => ({
  getStrategy: vi.fn((n: string) => (n === 'strat-a' || n === 'strat-b' ? { name: n, ctor: class {}, defaultConfig: {} } : undefined)),
  listStrategies: vi.fn().mockReturnValue([{ name: 'strat-a', description: 'A' }, { name: 'strat-b', description: 'B' }]),
}));

const mockRunner = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue({ status: 'stopped', tickCount: 3, proxyStats: { ordersPlaced: 2 } }),
  getPositionSummary: vi.fn().mockReturnValue({ positionCount: 1, totalExposure: 50, totalRealizedPnl: 12.5 }),
};

vi.mock('../../../../src/desk/polymarket/strategy-runner', () => ({
  StrategyRunner: class { constructor() { return mockRunner as unknown as this; } },
}));

const mockMulti = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  isDone: vi.fn().mockReturnValue(true),
  waitForDone: vi.fn().mockResolvedValue(undefined),
  getStatus: vi.fn().mockReturnValue({ status: 'stopped', runnerCount: 2, summary: { totalTicks: 6, totalOrders: 4 }, runners: [{ strategy: 'strat-a', ticks: 3, orders: 2 }] }),
  getOrchestrator: vi.fn().mockReturnValue({ getPositionSummary: vi.fn().mockReturnValue({ positionCount: 2, totalExposure: 100, totalRealizedPnl: -25 }) }),
};

vi.mock('../../../../src/desk/polymarket/multi-strategy-runner', () => ({
  MultiStrategyRunner: class { constructor() { return mockMulti as unknown as this; } },
}));

describe('cashclaw-trade-run-handler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('rejects invalid capital with error and exits with code 1', async () => {
    await expect(
      handleTradeRun({ strategy: 'strat-a', mode: 'paper', capital: '-100', ticks: '5', interval: '1000', yes: true }),
    ).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith('Error: --capital must be a positive number');
  });

  it('rejects invalid interval when NaN or < 1000ms with error and exits with code 1 (EC-3.2)', async () => {
    await expect(
      handleTradeRun({ strategy: 'strat-a', mode: 'paper', capital: '500', ticks: '5', interval: 'invalid', yes: true }),
    ).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith('Error: --interval must be >= 1000ms');

    vi.clearAllMocks();
    await expect(
      handleTradeRun({ strategy: 'strat-a', mode: 'paper', capital: '500', ticks: '5', interval: '500', yes: true }),
    ).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith('Error: --interval must be >= 1000ms');
  });

  it('rejects unknown strategy with error and exits with code 1', async () => {
    await expect(
      handleTradeRun({ strategy: 'unknown', mode: 'paper', capital: '1000', ticks: '5', interval: '1000', yes: true }),
    ).rejects.toThrow('process.exit(1)');
    expect(logger.error).toHaveBeenCalledWith('Unknown strategies: unknown');
  });

  it('executes single strategy paper mode run', async () => {
    await handleTradeRun({ strategy: 'strat-a', mode: 'paper', capital: '500', ticks: '3', interval: '1000', yes: true });
    expect(mockRunner.start).toHaveBeenCalled();
    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('CashClaw PAPER Strategy Runner'))).toBe(true);
  });

  it('executes multi-strategy paper run with comma separated list', async () => {
    await handleTradeRun({ strategy: 'strat-a,strat-b', mode: 'paper', capital: '1000', ticks: '5', interval: '2000', yes: true });
    expect(mockMulti.start).toHaveBeenCalled();
    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('Running 2 strategies concurrently'))).toBe(true);
  });

  it('executes all strategies when strategy is all', async () => {
    await handleTradeRun({ strategy: 'all', mode: 'paper', capital: '1500', ticks: '2', interval: '3000', yes: true });
    expect(mockMulti.start).toHaveBeenCalled();
  });

  it('validates live environment variables and rejects if missing', async () => {
    const origEnv = { ...process.env };
    delete process.env['POLYMARKET_API_KEY'];
    delete process.env['POLY_API_KEY'];
    delete process.env['POLYMARKET_API_SECRET'];
    try {
      await expect(
        handleTradeRun({ strategy: 'strat-a', mode: 'live', capital: '500', ticks: '1', interval: '1000', yes: true }),
      ).rejects.toThrow('process.exit(1)');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Cannot start LIVE trading. Missing env vars'));
    } finally {
      process.env = origEnv;
    }
  });

  it('allows live trading when required environment variables are set and yes is true', async () => {
    const origEnv = { ...process.env };
    process.env['POLYMARKET_API_KEY'] = 'k';
    process.env['POLYMARKET_API_SECRET'] = 's';
    process.env['POLYMARKET_PASSPHRASE'] = 'p';
    process.env['POLYMARKET_PRIVATE_KEY'] = 'pk';
    try {
      await handleTradeRun({ strategy: 'strat-a', mode: 'live', capital: '250', ticks: '1', interval: '1000', yes: true });
      expect(mockRunner.start).toHaveBeenCalled();
      const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('CashClaw LIVE Strategy Runner'))).toBe(true);
    } finally {
      process.env = origEnv;
    }
  });
});
