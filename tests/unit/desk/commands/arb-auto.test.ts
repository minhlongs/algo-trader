import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { runArbAuto, type AutoCommandOptions } from '../../../../src/desk/commands/arb-auto';
import * as orchestratorModule from '../../../../src/desk/arbitrage/orchestrator';
import { logger } from '../../../../src/shared/utils/logger';

let mockQuestionAnswer = 'y';
const mockClose = vi.fn();

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (ans: string) => void) => cb(mockQuestionAnswer)),
    close: mockClose,
  })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ARB:AUTO Command (runArbAuto)', () => {
  let mockOrchestrator: {
    on: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    getMetrics: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionAnswer = 'y';
    vi.mocked(fs.existsSync).mockReturnValue(true);

    mockOrchestrator = {
      on: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue({
        isRunning: true,
        scansPerformed: 100,
        opportunitiesDetected: 10,
        signalsScored: 10,
        actionableSignals: 5,
        executionsAttempted: 5,
        executionsSucceeded: 5,
        p95DetectionLatencyMs: 12,
        p95ExecutionLatencyMs: 45,
        totalProfit: 123.45,
        queueSize: 0,
        queueDropped: 0,
      }),
    };

    vi.spyOn(orchestratorModule, 'createStrategyOrchestrator').mockReturnValue(
      mockOrchestrator as unknown as ReturnType<typeof orchestratorModule.createStrategyOrchestrator>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with code 1 when .env does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    await runArbAuto();

    expect(logger.info).toHaveBeenCalledWith('⚠️  No .env found. Please run `algo-trader setup` first.\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('initializes orchestrator in dry-run mode with custom options and strategy', async () => {
    const options: AutoCommandOptions = {
      symbols: 'BTC/USDT,ETH/USDT',
      exchanges: 'binance,bybit',
      minSpread: 0.1,
      dryRun: true,
      verbose: false,
      strategy: 'cross-exchange',
      maxQueueSize: 20,
    };

    await runArbAuto(options);

    expect(orchestratorModule.createStrategyOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        symbols: ['BTC/USDT', 'ETH/USDT'],
        exchanges: ['binance', 'bybit'],
        minSpreadPercent: 0.1,
        dryRun: true,
        verbose: false,
        maxQueueSize: 20,
        strategy: 'cross-exchange',
      })
    );
    expect(mockOrchestrator.start).toHaveBeenCalled();
  });

  it('handles live mode confirmation and starts live orchestrator', async () => {
    mockQuestionAnswer = 'y';

    await runArbAuto({ dryRun: false });

    expect(logger.info).toHaveBeenCalledWith('⚠️  LIVE MODE — Real money at risk!\n');
    expect(mockOrchestrator.start).toHaveBeenCalled();
  });

  it('handles live mode cancellation and exits with 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockQuestionAnswer = 'n';

    await runArbAuto({ dryRun: false });

    expect(logger.info).toHaveBeenCalledWith('\n⚠️  Live trading cancelled. Exiting.\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockOrchestrator.start).not.toHaveBeenCalled();
  });

  it('handles orchestrator startup errors and triggers cleanup stop', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    mockOrchestrator.start.mockRejectedValueOnce(new Error('Connection failed'));

    await runArbAuto();

    expect(logger.error).toHaveBeenCalledWith('\n❌ ORCHESTRATOR ERROR\n');
    expect(logger.error).toHaveBeenCalledWith('Connection failed');
    expect(mockOrchestrator.stop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
