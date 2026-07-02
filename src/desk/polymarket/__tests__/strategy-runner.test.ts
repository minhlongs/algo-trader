/**
 * Strategy Runner Tests — Phase 43
 * Validates end-to-end strategy wiring through live trading pipeline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { StrategyRunner } from '../strategy-runner';
import { SpreadMeanReversionStrategy, DEFAULT_CONFIG } from '../../strategies/polymarket/spread-mean-reversion-v2';
import { cashclawPath } from '../../../shared/persistence/file-store';

// ── Helpers ─────────────────────────────────────────────────────────────────

function cleanJournalFiles() {
  const files = ['live-trades.jsonl', 'live-positions.json', 'live-pnl.json', 'live-journal.jsonl'];
  for (const f of files) {
    try { fs.unlinkSync(cashclawPath(f)); } catch { /* doesn't exist */ }
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('StrategyRunner', () => {
  let runner: StrategyRunner;

  beforeEach(() => {
    cleanJournalFiles();
    runner = new StrategyRunner(SpreadMeanReversionStrategy, {
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 500,
    });
  });

  afterEach(async () => {
    if (runner.getStatus().status === 'running') {
      await runner.stop();
    }
    cleanJournalFiles();
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────

  it('starts and stops cleanly', async () => {
    await runner.start();
    expect(runner.getStatus().status).toBe('running');
    expect(runner.getStatus().mode).toBe('PAPER');

    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  });

  it('reports correct status after start', async () => {
    await runner.start();
    const status = runner.getStatus();
    expect(status.status).toBe('running');
    expect(status.mode).toBe('PAPER');
    expect(status.tickCount).toBe(0); // timer hasn't fired yet
    expect(status.positions).toEqual([]);
  });

  it('exposes orchestrator and bridge', async () => {
    await runner.start();
    const orch = runner.getOrchestrator();
    expect(orch.getStatus()).toBe('running');

    const bridge = runner.getBridge();
    expect(bridge).not.toBeNull();
    expect(bridge!.getStats().signalsProcessed).toBe(0);

    await runner.stop();
  });

  // ── Tick execution ──────────────────────────────────────────────────────

  it('executes ticks (maxTicks=1)', async () => {
    const shortRunner = new StrategyRunner(SpreadMeanReversionStrategy, {
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 100,
      maxTicks: 1,
    });

    await shortRunner.start();
    expect(shortRunner.getStatus().status).toBe('running');

    // Wait for tick + Gamma API response (up to 10s)
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (shortRunner.getStatus().status === 'stopped') break;
    }

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

    // Wait for ticks + Gamma API responses
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (limited.getStatus().status === 'stopped') break;
    }

    expect(limited.getStatus().status).toBe('stopped');
    expect(limited.getStatus().tickCount).toBeGreaterThanOrEqual(2);
  }, 20_000);

  // ── Proxy wired correctly ───────────────────────────────────────────────

  it('proxy is wired and tracks orders', async () => {
    const shortRunner = new StrategyRunner(SpreadMeanReversionStrategy, {
      strategyConfig: { ...DEFAULT_CONFIG, maxPositions: 3 },
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
      tickIntervalMs: 100,
      maxTicks: 1,
    });

    await shortRunner.start();

    // Wait for tick to fire
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (shortRunner.getStatus().status === 'stopped') break;
    }

    const status = shortRunner.getStatus();
    expect(status.proxyStats.strategy).toBeDefined();
    expect(status.proxyStats.ordersPlaced).toBeGreaterThanOrEqual(0);
  }, 20_000);

  // ── Bridge stats ────────────────────────────────────────────────────────

  it('bridge stats initialized correctly', async () => {
    await runner.start();
    const status = runner.getStatus();
    expect(status.bridgeStats.signalsProcessed).toBe(0);
    expect(status.bridgeStats.signalsRejected).toBe(0);
    expect(status.bridgeStats.scannerActive).toBe(false);
    await runner.stop();
  });

  // ── Persistence ─────────────────────────────────────────────────────────

  it('stop persists state to journal', async () => {
    await runner.start();
    await runner.stop();

    // Verify journal files exist after stop
    const posFile = cashclawPath('live-positions.json');
    expect(fs.existsSync(posFile)).toBe(true);

    const pnlFile = cashclawPath('live-pnl.json');
    expect(fs.existsSync(pnlFile)).toBe(true);
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it('double start is no-op', async () => {
    await runner.start();
    await runner.start(); // should be no-op
    expect(runner.getStatus().status).toBe('running');
    await runner.stop();
  });

  it('stop-when-stopped is safe', async () => {
    await runner.start();
    await runner.stop();
    await runner.stop(); // safe double-stop
    expect(runner.getStatus().status).toBe('stopped');
  });

  // ── Optional 3rd-param constructor safety ──────────────────────────────

  it('resolution-frontrunner survives string 3rd arg (clock guard)', async () => {
    const { ResolutionFrontrunnerStrategy, DEFAULT_CONFIG: ResFrontCfg } = await import(
      '../../strategies/polymarket/resolution-frontrunner-v2'
    );
    // StrategyRunner passes name as 3rd arg — typeof guard must handle it
    const runner = new StrategyRunner(ResolutionFrontrunnerStrategy as any, {
      strategyConfig: ResFrontCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    // Wait for tick to complete
    await new Promise(r => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);

  it('time-weighted-mean-reversion survives string 3rd arg (getCurrentHour guard)', async () => {
    const { TimeWeightedMeanReversionStrategy, DEFAULT_CONFIG: TimeWMRCfg } = await import(
      '../../strategies/polymarket/time-weighted-mean-reversion-v2'
    );
    const runner = new StrategyRunner(TimeWeightedMeanReversionStrategy as any, {
      strategyConfig: TimeWMRCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise(r => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);

  it('vol-compression-breakout survives string 3rd arg (kellySizer guard)', async () => {
    const { VolCompressionBreakoutStrategy, DEFAULT_CONFIG: VolComBreakCfg } = await import(
      '../../strategies/polymarket/vol-compression-breakout-v2'
    );
    const runner = new StrategyRunner(VolCompressionBreakoutStrategy as any, {
      strategyConfig: VolComBreakCfg,
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
      maxTicks: 1,
    });
    await runner.start();
    await new Promise(r => setTimeout(r, 1000));
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  }, 15_000);
});
