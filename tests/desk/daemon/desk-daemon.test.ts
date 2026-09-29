/**
 * Desk Daemon Unit Test Suite
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDeskAutoConfig } from '../../../src/desk/commands/desk-auto-types';
import { DeskDaemon } from '../../../src/desk/daemon/desk-daemon';
import { verifyZeroDrift, prioritizeTradeIntents } from '../../../src/desk/daemon/desk-daemon-types';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './helpers/mock-desk-components';

describe('DeskDaemon Master Execution Daemon Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with institutional defaults and idle status', () => {
    const config = parseDeskAutoConfig({});
    const daemon = new DeskDaemon({ config, skipSignalHandlers: true });

    expect(daemon.isRunning()).toBe(false);
    expect(daemon.getCycleCount()).toBe(0);
    expect(daemon.getProcessedOrders()).toBe(0);

    const status = daemon.getStatus();
    expect(status.status).toBe('STOPPED');
    expect(status.mode).toBe('PAPER');
    expect(status.capitalUsd).toBe(100_000);
    expect(status.circuitBreakerTier).toBe('NORMAL');
    expect(status.driftUsd).toBeLessThan(1e-4);
    expect(status.isDriftValid).toBe(true);
  });

  it('starts, ticks, and stops master execution loop cleanly', async () => {
    const config = parseDeskAutoConfig({ capitalUsd: 50_000, pollIntervalMs: 5000 });
    const daemon = new DeskDaemon({ config, skipSignalHandlers: true });

    await daemon.start();
    expect(daemon.isRunning()).toBe(true);

    const arb = createMockArbIntent();
    daemon.supervisor.getEngine('arbitrage')?.setQueue?.([arb]);

    const results = await daemon.tick();
    expect(results.length).toBe(1);
    expect(results[0]?.enqueued).toBe(true);
    expect(daemon.getProcessedOrders()).toBe(1);
    expect(daemon.getCycleCount()).toBe(1);

    await daemon.stop();
    expect(daemon.isRunning()).toBe(false);
    expect(daemon.getStatus().status).toBe('STOPPED');
  });

  it('prioritizes intents and steps UnifiedTradingLoop in correct priority order', async () => {
    const config = parseDeskAutoConfig({ capitalUsd: 100_000, pollIntervalMs: 5000 });
    const daemon = new DeskDaemon({ config, skipSignalHandlers: true });
    await daemon.start();

    const lowAlpha = createMockAlphaIntent({ urgency: 'LOW', expectedEdgeBps: 10, isRiskReducing: false });
    const highArb = createMockArbIntent({ urgency: 'HIGH', expectedEdgeBps: 20, isRiskReducing: false });
    const riskRedMarl = createMockMarlIntent({ urgency: 'MEDIUM', expectedEdgeBps: 5, isRiskReducing: true });

    daemon.supervisor.getEngine('alpha-lab')?.setQueue?.([lowAlpha]);
    daemon.supervisor.getEngine('arbitrage')?.setQueue?.([highArb]);
    daemon.supervisor.getEngine('marl')?.setQueue?.([riskRedMarl]);

    const stepSpy = vi.spyOn(daemon.loop, 'step');
    await daemon.tick();

    expect(stepSpy).toHaveBeenCalledTimes(3);
    // 1st stepped should be risk-reducing marl (score 100 + 25 + 5 = 130)
    expect(stepSpy.mock.calls[0][0].engineId).toBe('marl');
    // 2nd stepped should be high urgency arbitrage (score 50 + 20 = 70)
    expect(stepSpy.mock.calls[1][0].engineId).toBe('arbitrage');
    // 3rd stepped should be low urgency alpha-lab (score 10 + 10 = 20)
    expect(stepSpy.mock.calls[2][0].engineId).toBe('alpha-lab');

    await daemon.stop();
  });

  it('enforces Zero Accounting Drift invariant (|delta| < 10^-4 USD)', () => {
    const nav = 100_000;
    const allocated = { arbitrage: 25_000, marl: 25_000, amm: 20_000, 'alpha-lab': 10_000 };
    const cash = 20_000;

    const validDrift = verifyZeroDrift(nav, allocated, cash);
    expect(validDrift.valid).toBe(true);
    expect(validDrift.driftUsd).toBe(0);

    // Perturbation of $1 exceeding threshold
    const invalidDrift = verifyZeroDrift(nav, allocated, 19_998.5);
    expect(invalidDrift.valid).toBe(false);
    expect(invalidDrift.driftUsd).toBeCloseTo(1.5, 4);

    const daemon = new DeskDaemon({ config: parseDeskAutoConfig({ capitalUsd: 100_000 }), skipSignalHandlers: true });
    const driftCheck = daemon.verifyAccountingDrift();
    expect(driftCheck.valid).toBe(true);
    expect(driftCheck.driftUsd).toBeLessThan(1e-4);
  });

  it('intercepts OS signals and triggers emergency halt within <= 100ms', async () => {
    let cancelCalled = false;
    const config = parseDeskAutoConfig({ capitalUsd: 100_000 });
    const daemon = new DeskDaemon({
      config,
      skipSignalHandlers: true,
      cancelAllOrders: async () => { cancelCalled = true; },
    });

    await daemon.start();
    const elapsedMs = await daemon.handleSignal('SIGINT');

    expect(elapsedMs).toBeLessThanOrEqual(100);
    expect(cancelCalled).toBe(true);
    expect(daemon.isRunning()).toBe(false);
    expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');
    expect(daemon.loop.riskGate.getTier()).toBe('HARD_STOP');
  });

  it('is idempotent on duplicate emergency halt calls', async () => {
    const config = parseDeskAutoConfig({ capitalUsd: 100_000 });
    const daemon = new DeskDaemon({ config, skipSignalHandlers: true });
    await daemon.start();

    const t1 = await daemon.triggerEmergencyHalt('First halt');
    const t2 = await daemon.triggerEmergencyHalt('Second halt');

    expect(t1).toBeLessThanOrEqual(100);
    expect(t2).toBeLessThanOrEqual(100);
    expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');
  });

  it('trips emergency halt when feed freshness watchdog stalls', async () => {
    const config = parseDeskAutoConfig({ capitalUsd: 100_000 });
    const daemon = new DeskDaemon({ config, skipSignalHandlers: true });
    await daemon.start();

    // Record an initial tick 6,000ms in the past
    daemon.watchdog.recordTick('binance', 'BTC/USDT', Date.now() - 6000);
    daemon.watchdog.checkFreshness();

    expect(daemon.watchdog.isTripped()).toBe(true);
    expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');
    expect(daemon.loop.riskGate.getTier()).toBe('HARD_STOP');

    // Ticks should be blocked
    daemon.supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent()]);
    const stepResults = await daemon.tick();
    expect(stepResults).toHaveLength(0);

    await daemon.stop();
  });

  it('filters expired intents during prioritization', () => {
    const now = Date.now();
    const valid = createMockArbIntent({ expiresAt: now + 10_000 });
    const expired = createMockMarlIntent({ expiresAt: now - 500 });

    const prioritized = prioritizeTradeIntents([valid, expired], now);
    expect(prioritized).toHaveLength(1);
    expect(prioritized[0]?.intentId).toBe(valid.intentId);
  });
});
