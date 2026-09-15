/**
 * Strategy Runner Tests — Phase 43 / Tranche 41
 * Validates lifecycle, status reporting, bridge wiring, and state persistence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { StrategyRunner } from '../strategy-runner';
import { SpreadMeanReversionStrategy, DEFAULT_CONFIG } from '../../strategies/polymarket/spread-mean-reversion-v2';
import { cashclawPath } from '../../../shared/persistence/file-store';
import { cleanJournalFiles } from './strategy-runner-fixtures';

describe('StrategyRunner — Lifecycle & Persistence', () => {
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
    expect(status.tickCount).toBe(0);
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

  it('bridge stats initialized correctly', async () => {
    await runner.start();
    const status = runner.getStatus();
    expect(status.bridgeStats.signalsProcessed).toBe(0);
    expect(status.bridgeStats.signalsRejected).toBe(0);
    expect(status.bridgeStats.scannerActive).toBe(false);
    await runner.stop();
  });

  it('stop persists state to journal', async () => {
    await runner.start();
    await runner.stop();

    const posFile = cashclawPath('live-positions.json');
    expect(fs.existsSync(posFile)).toBe(true);

    const pnlFile = cashclawPath('live-pnl.json');
    expect(fs.existsSync(pnlFile)).toBe(true);
  });

  it('double start is no-op', async () => {
    await runner.start();
    await runner.start();
    expect(runner.getStatus().status).toBe('running');
    await runner.stop();
  });

  it('stop-when-stopped is safe', async () => {
    await runner.start();
    await runner.stop();
    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  });
});
