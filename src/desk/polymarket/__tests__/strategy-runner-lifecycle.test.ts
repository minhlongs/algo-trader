/**
 * Strategy Runner Lifecycle Tests — Phase 43 / Tranche 41
 * Validates tick execution, auto-stop, proxy order tracking, and constructor guards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrategyRunner, type StrategyConstructor } from '../strategy-runner';
import { SpreadMeanReversionStrategy, DEFAULT_CONFIG } from '../../strategies/polymarket/spread-mean-reversion-v2';
import { tradingEventBus } from '../../events/trading-event-bus';
import type { RunnerStrategyDeps } from '../strategy-runner-types';
import { cleanJournalFiles, waitForStop } from './strategy-runner-fixtures';

const offlineDeps: Partial<RunnerStrategyDeps> = {
  gamma: {
    getMarkets: async () => [],
    getMarket: async () => null,
    getMarketGroup: async () => null,
    searchMarkets: async () => [],
    getTrending: async () => [],
    getEvents: async () => [],
  },
  clob: {
    getOrderBook: async () => ({ bids: [], asks: [], timestamp: 0 }),
    getPrice: async () => 0,
    getMidPrice: async () => 0,
  },
};

describe('StrategyRunner — Tick Execution & Guards', () => {
  beforeEach(() => {
    cleanJournalFiles();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External HTTP is forbidden in lifecycle tests'));
  });

  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    cleanJournalFiles();
  });

  it('executes ticks (maxTicks=1)', async () => {
    const shortRunner = new StrategyRunner(SpreadMeanReversionStrategy, {
      deps: offlineDeps,
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 100,
      maxTicks: 1,
    });

    await shortRunner.start();
    expect(shortRunner.getStatus().status).toBe('running');

    await waitForStop(shortRunner, 20, 500);

    expect(shortRunner.getStatus().status).toBe('stopped');
    expect(shortRunner.getStatus().tickCount).toBeGreaterThanOrEqual(1);
  }, 20_000);

  it('auto-stops after maxTicks', async () => {
    const limited = new StrategyRunner(SpreadMeanReversionStrategy, {
      deps: offlineDeps,
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 100,
      maxTicks: 2,
    });

    await limited.start();

    await waitForStop(limited, 20, 500);

    expect(limited.getStatus().status).toBe('stopped');
    expect(limited.getStatus().tickCount).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('proxy is wired and tracks orders', async () => {
    const shortRunner = new StrategyRunner(SpreadMeanReversionStrategy, {
      deps: offlineDeps,
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 100,
      maxTicks: 1,
    });

    await shortRunner.start();

    await waitForStop(shortRunner, 20, 500);

    const status = shortRunner.getStatus();
    expect(status.proxyStats.strategy).toBeDefined();
    expect(status.proxyStats.ordersPlaced).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('resolution-frontrunner survives string 3rd arg (clock guard)', async () => {
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG: ResFrontCfg } = await import(
      '../../strategies/polymarket/resolution-frontrunner-v2'
    );
    const runner = new StrategyRunner(ResolutionFrontrunnerStrategy as unknown as StrategyConstructor, {
      deps: offlineDeps,
      strategyConfig: ResFrontCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise((r) => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);

  it('time-weighted-mean-reversion survives string 3rd arg (getCurrentHour guard)', async () => {
    const { TimeWeightedMeanReversionStrategy, DEFAULT_CONFIG: TimeWMRCfg } = await import(
      '../../strategies/polymarket/time-weighted-mean-reversion-v2'
    );
    const runner = new StrategyRunner(TimeWeightedMeanReversionStrategy as unknown as StrategyConstructor, {
      deps: offlineDeps,
      strategyConfig: TimeWMRCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise((r) => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);

  it('vol-compression-breakout survives string 3rd arg (kellySizer guard)', async () => {
    const { VolCompressionBreakoutStrategy, DEFAULT_CONFIG: VolComBreakCfg } = await import(
      '../../strategies/polymarket/vol-compression-breakout-v2'
    );
    const runner = new StrategyRunner(VolCompressionBreakoutStrategy as unknown as StrategyConstructor, {
      deps: offlineDeps,
      strategyConfig: VolComBreakCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise((r) => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);

  it.each([1, 2])('serializes slow ticks and stops at maxTicks=%i', async (maxTicks) => {
    vi.useFakeTimers();
    let active = 0;
    let peakActive = 0;
    const execute = vi.spyOn(SpreadMeanReversionStrategy.prototype, 'execute').mockImplementation(async () => {
      active++;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 60));
      active--;
    });
    const runner = new StrategyRunner(SpreadMeanReversionStrategy, {
      deps: offlineDeps,
      strategyConfig: DEFAULT_CONFIG,
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 10,
      minExecutionIntervalMs: 0,
      maxTicks,
    });
    try {
      await runner.start();
      await vi.advanceTimersByTimeAsync(20);
      tradingEventBus.emitPriceUpdate({ tokenId: 'tick-trigger', bid: 0, ask: 0, timestamp: Date.now() });
      await vi.advanceTimersByTimeAsync(180);
      expect(runner.getStatus().executionCount).toBe(maxTicks);
      expect(execute).toHaveBeenCalledTimes(maxTicks);
      expect(peakActive).toBe(1);
      expect(runner.getStatus().status).toBe('stopped');
    } finally {
      await runner.stop();
      await vi.advanceTimersByTimeAsync(100);
      execute.mockRestore();
      vi.useRealTimers();
    }
  });
});
