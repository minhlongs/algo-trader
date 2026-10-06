import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import readline from 'node:readline';
import { runQuickstart } from '../../../../src/desk/commands/quickstart';
import * as setupWizardModule from '../../../../src/desk/commands/setup-wizard';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../../src/desk/commands/setup-wizard', () => ({
  runSetupWizard: vi.fn(),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Quickstart Command (runQuickstart)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('triggers setup wizard when .env does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.DRY_RUN = 'true';
    process.env.RISK_PER_TRADE = '1';
    process.env.MAX_DAILY_LOSS = '5';

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(setupWizardModule.runSetupWizard).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('No configuration found. Running setup wizard...');
  });

  it('runs dry-run engine when tradingMode is dry-run', async () => {
    process.env.DRY_RUN = 'true';
    process.env.RISK_PER_TRADE = '2';
    process.env.MAX_DAILY_LOSS = '8';
    process.env.ENABLE_BACKTESTING = 'true';
    process.env.ENABLE_LIVE_TRADING = 'false';

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(logger.info).toHaveBeenCalledWith(
      'Starting in DRY-RUN mode (paper trading) - no real trades will be executed'
    );
    expect(logger.info).toHaveBeenCalledWith(
      'DRY-RUN ENGINE STARTED - waiting for trading signals'
    );
  });

  it('runs live engine when confirmed via interactive prompt', async () => {
    process.env.DRY_RUN = 'false';
    process.env.EXCHANGE_API_KEY = 'valid-key';
    process.env.EXCHANGE_SECRET = 'valid-secret';
    process.env.ENABLE_LIVE_TRADING = 'true';
    process.env.RISK_PER_TRADE = '1.5';
    process.env.MAX_DAILY_LOSS = '6';

    const closeMock = vi.fn();
    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => cb('y')),
      close: closeMock,
    } as unknown as ReturnType<typeof readline.createInterface>);

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(logger.warn).toHaveBeenCalledWith('Starting in LIVE mode - real money at risk!');
    expect(logger.warn).toHaveBeenCalledWith(
      'LIVE ENGINE STARTED - REAL MONEY AT RISK - monitoring markets'
    );
    expect(closeMock).toHaveBeenCalled();
  });

  it('falls back to dry-run engine when live trading prompt is declined', async () => {
    process.env.DRY_RUN = 'false';
    process.env.EXCHANGE_API_KEY = 'valid-key';
    process.env.EXCHANGE_SECRET = 'valid-secret';
    process.env.ENABLE_LIVE_TRADING = 'true';
    process.env.RISK_PER_TRADE = '1';
    process.env.MAX_DAILY_LOSS = '5';

    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question: vi.fn((_prompt: string, cb: (ans: string) => void) => cb('n')),
      close: vi.fn(),
    } as unknown as ReturnType<typeof readline.createInterface>);

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(logger.warn).toHaveBeenCalledWith('Live trading cancelled. Starting in dry-run mode...');
    expect(logger.info).toHaveBeenCalledWith(
      'DRY-RUN ENGINE STARTED - waiting for trading signals'
    );
  });

  it('logs warnings when risk exceeds daily loss or live mode lacks keys', async () => {
    process.env.DRY_RUN = 'false';
    process.env.RISK_PER_TRADE = '6';
    process.env.MAX_DAILY_LOSS = '4'; // risk > max daily loss warning
    // No API keys configured warning

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(logger.warn).toHaveBeenCalledWith(
      'Configuration warning: RISK_PER_TRADE is higher than MAX_DAILY_LOSS'
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Configuration warning: Live trading mode but no API keys configured'
    );
  });

  it('exits process with code 1 when configuration validation errors occur', async () => {
    process.env.RISK_PER_TRADE = '15'; // Out of bounds (> 10)
    process.env.MAX_DAILY_LOSS = '-1'; // Out of bounds (<= 0)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    const promise = runQuickstart();
    await vi.runAllTimersAsync();
    await promise;

    expect(logger.error).toHaveBeenCalledWith(
      'Configuration error: RISK_PER_TRADE must be between 0 and 10'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Configuration error: MAX_DAILY_LOSS must be between 0 and 50'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('instantiates genuine UnifiedTradingLoop with active state in startDryRunEngine', async () => {
    const { startDryRunEngine } = await import('../../../../src/desk/commands/quickstart');
    const promise = startDryRunEngine({ riskPerTrade: 1, maxDailyLoss: 5 });
    await vi.runAllTimersAsync();
    const loop = await promise;

    expect(loop).toBeDefined();
    expect(loop.getState()).toBe('RUNNING');
    expect(loop.dispatcher.mode).toBe('PAPER');
  });

  it('instantiates genuine UnifiedTradingLoop with active state in startLiveEngine', async () => {
    const { startLiveEngine } = await import('../../../../src/desk/commands/quickstart');
    const promise = startLiveEngine({ riskPerTrade: 2, maxDailyLoss: 8 });
    await vi.runAllTimersAsync();
    const loop = await promise;

    expect(loop).toBeDefined();
    expect(loop.getState()).toBe('RUNNING');
    expect(loop.dispatcher.mode).toBe('LIVE');
  });
});

