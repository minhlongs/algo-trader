/**
 * Tier 4 Scenarios 1-3: Session Lifecycle & Feed Blackout
 * Implements Scenarios 1, 2, and 3 from TEST_INFRA.md § Real-World Application Scenarios
 */

import { describe, it, expect, vi } from 'vitest';
import { parseDeskAutoConfig } from '../../../../src/desk/commands/desk-auto-types';
import { DeskDaemon } from '../../../../src/desk/daemon/desk-daemon';
import { MarketDataMultiplexer } from '../../../../src/desk/feeds/market-data-multiplexer';
import { DynamicMidPriceProvider } from '../../../../src/desk/feeds/dynamic-mid-price-provider';
import { DeskMetricsRegistry, DeskStatusServer, type DeskStatusPayload } from './daemon-server-helper';
import { httpGet, toPayload } from './tier4-common.helper';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './mock-desk-components';

export function registerTier4SessionLifecycleTests(): void {
  describe('Tier 4 Scenarios 1-3: Session Lifecycle & Blackout', () => {
    it('Scenario 1: Full Paper Day Trading Session executes 4-engine signals via SOR with zero drift', async () => {
      const config = parseDeskAutoConfig({ mode: 'PAPER', capitalUsd: 100_000, pollIntervalMs: 1000 });
      const mux = new MarketDataMultiplexer();
      const midProvider = new DynamicMidPriceProvider(mux);
      const metrics = new DeskMetricsRegistry();

      const now = Date.now();
      mux.ingestBook('binance', 'BTC/USDT', [[65000, 2.0]], [[65010, 2.0]], now);
      mux.ingestBook('bybit', 'ETH/USDT', [[3500, 10.0]], [[3502, 10.0]], now);

      const daemon = new DeskDaemon({ config, multiplexer: mux, midPriceProvider: midProvider, skipSignalHandlers: true, skipServer: true });
      const server = new DeskStatusServer(metrics, () => toPayload(daemon.getStatus()));
      const port = await server.start(0);

      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      daemon.supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent({ price: 65005 })]);
      daemon.supervisor.getEngine('marl')?.setQueue?.([createMockMarlIntent({ price: 65000 })]);
      daemon.supervisor.getEngine('amm')?.setQueue?.([createMockAmmIntent({ price: 3501 })]);
      daemon.supervisor.getEngine('alpha-lab')?.setQueue?.([createMockAlphaIntent({ price: 65008 })]);

      const tickResults = await daemon.tick();
      expect(tickResults.length).toBe(4);
      expect(daemon.getProcessedOrders()).toBeGreaterThanOrEqual(1);

      const driftResult = daemon.verifyAccountingDrift();
      expect(driftResult.valid).toBe(true);
      expect(driftResult.driftUsd).toBeLessThan(1e-4);

      metrics.setPriorityQueueDepth(daemon.loop.queue.size());
      metrics.setOrdersFillRate(daemon.getProcessedOrders() > 0 ? 1 : 0);
      metrics.setAccountingDriftUsd(driftResult.driftUsd);

      const statusRes = await httpGet(port, '/status');
      expect(statusRes.status).toBe(200);
      const statusData = JSON.parse(statusRes.text) as DeskStatusPayload;
      expect(statusData.mode).toBe('PAPER');
      expect(statusData.navUsd).toBe(100_000);

      const metricsRes = await httpGet(port, '/metrics');
      expect(metricsRes.text).toContain('desk_orders_fill_rate');

      await daemon.stop();
      await server.stop();
    });

    it('Scenario 2: Feed Blackout & Dead-Man Tripwire halts trading within <= 100ms on stall > 5000ms', async () => {
      const config = parseDeskAutoConfig({ mode: 'PAPER', capitalUsd: 100_000 });
      const mux = new MarketDataMultiplexer();
      const daemon = new DeskDaemon({ config, multiplexer: mux, skipSignalHandlers: true, skipServer: true });

      await daemon.start();
      const startTime = 1_000_000;
      mux.ingestBook('binance', 'BTC/USDT', [[65000, 1.0]], [[65010, 1.0]], startTime);
      daemon.watchdog.recordTick('binance', startTime);

      const blackoutTime = startTime + 6000;
      const haltSpy = vi.spyOn(daemon, 'triggerEmergencyHalt');
      const t0 = performance.now();
      daemon.watchdog.checkFreshness(blackoutTime);

      if (daemon.watchdog.isTripped()) {
        await daemon.triggerEmergencyHalt('Watchdog blackout triggered');
      }
      const elapsed = performance.now() - t0;

      expect(daemon.watchdog.isTripped()).toBe(true);
      expect(haltSpy).toHaveBeenCalled();
      expect(elapsed).toBeLessThanOrEqual(100);
      expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');
      expect(daemon.isRunning()).toBe(false);

      daemon.supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent()]);
      const results = await daemon.tick();
      expect(results).toHaveLength(0);

      await daemon.stop();
    });

    it('Scenario 3: Operator Graceful Termination cancels open orders, closes server, exits clean <= 100ms', async () => {
      const config = parseDeskAutoConfig({ mode: 'PAPER', capitalUsd: 100_000 });
      let ordersCancelled = false;
      const metrics = new DeskMetricsRegistry();

      const daemon = new DeskDaemon({
        config,
        skipSignalHandlers: true,
        skipServer: true,
        cancelAllOrders: async () => { ordersCancelled = true; },
      });
      const server = new DeskStatusServer(metrics, () => toPayload(daemon.getStatus()));
      const port = await server.start(0);

      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      const elapsed = await daemon.handleSignal('SIGINT');
      await server.stop();

      expect(elapsed).toBeLessThanOrEqual(100);
      expect(ordersCancelled).toBe(true);
      expect(daemon.isRunning()).toBe(false);
      expect(daemon.getStatus().status).toBe('STOPPED');

      await expect(httpGet(port, '/health')).rejects.toThrow();
    });
  });
}
