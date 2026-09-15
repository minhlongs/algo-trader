/**
 * Strategy Runner Lifecycle Tests — Phase 43 / Tranche 41
 * Validates tick execution, auto-stop, proxy order tracking, and constructor guards.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StrategyRunner, type StrategyConstructor } from '../strategy-runner';
import { SpreadMeanReversionStrategy, DEFAULT_CONFIG } from '../../strategies/polymarket/spread-mean-reversion-v2';
import { cleanJournalFiles, waitForStop } from './strategy-runner-fixtures';

describe('StrategyRunner — Tick Execution & Guards', () => {
  beforeEach(() => {
    cleanJournalFiles();
  });

  afterEach(() => {
    cleanJournalFiles();
  });

  it('executes ticks (maxTicks=1)', async () => {
    const shortRunner = new StrategyRunner(SpreadMeanReversionStrategy, {
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
      strategyConfig: VolComBreakCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise((r) => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);
});
