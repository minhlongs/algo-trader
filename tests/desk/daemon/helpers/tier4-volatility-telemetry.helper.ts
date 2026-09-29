/**
 * Tier 4 Scenarios 4-5: Volatility Spike & Telemetry Concurrency
 * Implements Scenarios 4 and 5 from TEST_INFRA.md § Real-World Application Scenarios
 */

import { describe, it, expect, vi } from 'vitest';
import { parseDeskAutoConfig } from '../../../../src/desk/commands/desk-auto-types';
import { DeskDaemon } from '../../../../src/desk/daemon/desk-daemon';
import { MarketDataMultiplexer } from '../../../../src/desk/feeds/market-data-multiplexer';
import { DynamicMidPriceProvider } from '../../../../src/desk/feeds/dynamic-mid-price-provider';
import { DeskMetricsRegistry, DeskStatusServer } from './daemon-server-helper';
import { httpGet, toPayload } from './tier4-common.helper';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './mock-desk-components';

export function registerTier4VolatilityTelemetryTests(): void {
  describe('Tier 4 Scenarios 4-5: Volatility Spike & Telemetry Concurrency', () => {
    it('Scenario 4: Rapid Multi-Engine Arbitrage & Volatility Spike processes in priority order with zero drift', async () => {
      const config = parseDeskAutoConfig({ mode: 'PAPER', capitalUsd: 100_000 });
      const mux = new MarketDataMultiplexer();
      const midProvider = new DynamicMidPriceProvider(mux);
      const daemon = new DeskDaemon({ config, multiplexer: mux, midPriceProvider: midProvider, skipSignalHandlers: true });

      const now = Date.now();
      mux.ingestBook('binance', 'BTC/USDT', [[64950, 5.0]], [[65050, 5.0]], now);
      await daemon.start();

      const intents = [
        createMockMarlIntent({ urgency: 'MEDIUM', expectedEdgeBps: 15, isRiskReducing: true, price: 65000 }),
        createMockArbIntent({ urgency: 'HIGH', expectedEdgeBps: 85, isRiskReducing: false, price: 64980 }),
        createMockAlphaIntent({ urgency: 'LOW', expectedEdgeBps: 10, isRiskReducing: false, price: 65010 }),
        createMockAmmIntent({ urgency: 'LOW', expectedEdgeBps: 5, isRiskReducing: false, price: 65020 }),
      ];

      daemon.supervisor.getEngine('marl')?.setQueue?.([intents[0]!]);
      daemon.supervisor.getEngine('arbitrage')?.setQueue?.([intents[1]!]);
      daemon.supervisor.getEngine('alpha-lab')?.setQueue?.([intents[2]!]);
      daemon.supervisor.getEngine('amm')?.setQueue?.([intents[3]!]);

      const stepSpy = vi.spyOn(daemon.loop, 'step');
      const results = await daemon.tick();

      expect(results.length).toBe(4);
      expect(stepSpy.mock.calls[0]?.[0]?.engineId).toBe('marl');
      expect(stepSpy.mock.calls[1]?.[0]?.engineId).toBe('arbitrage');

      const drift = daemon.verifyAccountingDrift();
      expect(drift.valid).toBe(true);
      expect(drift.driftUsd).toBeLessThan(1e-4);

      await daemon.stop();
    });

    it('Scenario 5: HTTP Status & Prometheus Telemetry Query concurrently during active trading', async () => {
      const config = parseDeskAutoConfig({ mode: 'PAPER', capitalUsd: 100_000 });
      const daemon = new DeskDaemon({ config, skipSignalHandlers: true });
      const metrics = new DeskMetricsRegistry();
      const server = new DeskStatusServer(metrics, () => toPayload(daemon.getStatus()));
      const port = await server.start(0);

      await daemon.start();

      const endpoints = ['/health', '/status', '/api/desk/allocations', '/metrics'];
      const requests: Array<Promise<{ status: number; text: string }>> = [];
      for (let i = 0; i < 20; i++) {
        const ep = endpoints[i % endpoints.length]!;
        requests.push(httpGet(port, ep));
      }

      const responses = await Promise.all(requests);
      expect(responses).toHaveLength(20);
      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.text.length).toBeGreaterThan(0);
      }

      const healthRes = responses.find((_, idx) => endpoints[idx % endpoints.length] === '/health');
      expect(JSON.parse(healthRes!.text)).toMatchObject({ status: 'ok' });

      await daemon.stop();
      await server.stop();
    });
  });
}
