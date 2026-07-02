/**
 * Multi-Strategy Runner Tests — Phase 46–49
 * Validates concurrent strategy execution sharing one orchestrator.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { MultiStrategyRunner } from '../multi-strategy-runner';
import { StrategyRunner } from '../strategy-runner';
import { listStrategies } from '../strategy-registry';
import { cashclawPath } from '../../../shared/persistence/file-store';

function cleanJournalFiles() {
  const files = ['live-trades.jsonl', 'live-positions.json', 'live-pnl.json', 'live-journal.jsonl'];
  for (const f of files) {
    try { fs.unlinkSync(cashclawPath(f)); } catch { /* doesn't exist */ }
  }
}

describe('MultiStrategyRunner', () => {
  beforeEach(() => cleanJournalFiles());
  afterEach(() => cleanJournalFiles());

  it('creates with multiple strategies', () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion', 'momentum-cascade'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    expect(runner.getStatus().runnerCount).toBe(2);
    expect(runner.getStatus().status).toBe('stopped');
  });

  it('throws on unknown strategy', () => {
    expect(() => new MultiStrategyRunner({
      strategies: ['nonexistent-strategy'],
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
    })).toThrow('Unknown strategies');
  });

  it('throws on empty strategy list', () => {
    expect(() => new MultiStrategyRunner({
      strategies: [],
      tradingConfig: { paperTrading: true, capitalUsdc: 1000 },
    })).toThrow('At least one strategy');
  });

  it('starts and stops cleanly', async () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion', 'vwap-deviation-sniper'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    await runner.start();
    expect(runner.getStatus().status).toBe('running');

    await runner.stop();
    expect(runner.getStatus().status).toBe('stopped');
  });

  it('status includes per-strategy breakdown', async () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    await runner.start();
    const status = runner.getStatus();
    expect(status.runners).toHaveLength(1);
    expect(status.runners[0].strategy).toBe('spread-mean-reversion');
    expect(status.runners[0].ticks).toBe(0);

    await runner.stop();
  });

  it('shares orchestrator across all runners', async () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion', 'momentum-cascade'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    await runner.start();
    const orch = runner.getOrchestrator();
    expect(orch.getStatus()).toBe('running');

    // All runners share same orchestrator
    const runners = runner.getRunners();
    for (const r of runners) {
      expect(r.getOrchestrator()).toBe(orch);
    }

    await runner.stop();
  });

  it('creates correct number of runners', () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion', 'bollinger-squeeze', 'momentum-cascade'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    expect(runner.getRunners()).toHaveLength(3);
    expect(runner.getStatus().runnerCount).toBe(3);
  });

  it('summary aggregates across runners', async () => {
    const runner = new MultiStrategyRunner({
      strategies: ['spread-mean-reversion', 'bollinger-squeeze'],
      tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
    });

    await runner.start();
    const status = runner.getStatus();
    expect(status.summary.totalTicks).toBe(0);
    expect(status.summary.totalOrders).toBe(0);
    expect(status.mode).toBe('PAPER');

    await runner.stop();
  });

  // ── All-32-strategies smoke test (Phase 49) ─────────────────────────────

  it('all 32 registered strategies boot and complete 2 ticks without crash', async () => {
    const allNames = listStrategies().map(s => s.name);
    expect(allNames.length).toBeGreaterThanOrEqual(32);

    const runner = new MultiStrategyRunner({
      strategies: allNames,
      tradingConfig: { paperTrading: true, capitalUsdc: 10000 },
      maxTicks: 2,
      tickIntervalMs: 500,
    });

    await runner.start();
    expect(runner.getStatus().status).toBe('running');

    // Wait for all runners to complete (maxTicks=2 → auto-stop)
    await runner.waitForDone();

    const status = runner.getStatus();
    expect(status.summary.totalTicks).toBeGreaterThan(0);

    // Verify every strategy completed without error
    for (const r of status.runners) {
      expect(r.status, `${r.strategy} should be stopped (not error)`).toBe('stopped');
    }

    // Verify state files were written by orchestrator
    const posFile = cashclawPath('live-positions.json');
    const pnlFile = cashclawPath('live-pnl.json');
    expect(fs.existsSync(posFile) || fs.existsSync(pnlFile)).toBe(true);
  }, 60_000);
});
