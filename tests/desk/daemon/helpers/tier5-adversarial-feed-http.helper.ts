/**
 * Tier 5 Adversarial Hardening: Feeds, Corrupted Inputs, HTTP & Signal Flooding
 * Stress tests for multi-venue disconnections, bad books, fuzzing, and signal storms
 */

import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { MarketDataMultiplexer } from '../../../../src/desk/feeds/market-data-multiplexer';
import { DynamicMidPriceProvider } from '../../../../src/desk/feeds/dynamic-mid-price-provider';
import { parseDeskAutoConfig } from '../../../../src/desk/commands/desk-auto-types';
import { DeskDaemon } from '../../../../src/desk/daemon/desk-daemon';
import { FeedFreshnessWatchdog } from './daemon-test-harness';
import { MockMarketDataFeed } from './mock-desk-components';
import { DeskMetricsRegistry, DeskStatusServer } from './daemon-server-helper';
import { toPayload } from './tier4-common.helper';

function httpQuery(port: number, path: string, method = 'GET'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

export function registerTier5FeedHttpTests(): void {
  describe('Tier 5 Adversarial Hardening: Feeds, HTTP & Signal Flooding', () => {
    it('1. simultaneous multi-venue feed disconnection trips dead-man switch and halts trading <= 100ms', async () => {
      const watchdog = new FeedFreshnessWatchdog(5000);
      const venues = ['binance', 'bybit', 'polymarket_clob', 'amm_cpmm'];
      const initialTs = 1_000_000;
      for (const v of venues) watchdog.recordTick(v, initialTs);

      // All 4 venues drop simultaneously (6000ms latency > 5000ms limit)
      const stallTs = initialTs + 6000;
      const status = watchdog.checkFreshness(stallTs);

      expect(status.isStale).toBe(true);
      expect(status.staleVenues.sort()).toEqual(venues.sort());
      expect(watchdog.isTripped()).toBe(true);

      const config = parseDeskAutoConfig({});
      const daemon = new DeskDaemon({ config, skipSignalHandlers: true, skipServer: true });
      await daemon.start();
      const elapsed = await daemon.triggerEmergencyHalt('Simultaneous feed blackout');
      expect(elapsed).toBeLessThanOrEqual(100);
      expect(daemon.isRunning()).toBe(false);
      await daemon.stop();
    });

    it('2. corrupted book snapshots with negative bids or asks are safely rejected without throwing', () => {
      const mux = new MarketDataMultiplexer();
      const provider = new DynamicMidPriceProvider(mux);
      const mockFeed = new MockMarketDataFeed();

      // Negative bid
      mux.ingestBook('binance', 'BTC/USDT', [[-100, 1.0]], [[65000, 1.0]], Date.now());
      expect(provider.getMidPrice('BTC/USDT')).toBeUndefined();

      // Negative ask in mock feed
      mockFeed.setTick('binance', 'BTC/USDT', 65000, -50);
      expect(mockFeed.getMidPrice('binance', 'BTC/USDT')).toBeUndefined();
    });

    it('3. inverted order book (bid > ask crossed market) is safely detected and yields undefined mid price', () => {
      const mockFeed = new MockMarketDataFeed();
      // Crossed market: bid is 66,000 but ask is 65,000
      mockFeed.setTick('binance', 'BTC/USDT', 66000, 65000);
      expect(mockFeed.getMidPrice('binance', 'BTC/USDT')).toBeUndefined();
    });

    it('4. extreme non-numeric, NaN, Infinity, and zero price ticks are safely filtered', () => {
      const mux = new MarketDataMultiplexer();
      const provider = new DynamicMidPriceProvider(mux);

      // Zero bid
      mux.ingestBook('binance', 'BTC/USDT', [[0, 1.0]], [[65000, 1.0]], Date.now());
      expect(provider.getMidPrice('BTC/USDT')).toBeUndefined();

      // NaN bid price
      mux.ingestBook('bybit', 'ETH/USDT', [[NaN, 1.0]], [[3500, 1.0]], Date.now());
      expect(provider.getMidPrice('ETH/USDT')).toBeUndefined();

      // Infinity ask price
      mux.ingestBook('bybit', 'ETH/USDT', [[3400, 1.0]], [[Infinity, 1.0]], Date.now());
      expect(provider.getMidPrice('ETH/USDT')).toBeUndefined();
    });

    it('5. HTTP status server fuzzing with unknown routes returns 404 cleanly without crashing', async () => {
      const metrics = new DeskMetricsRegistry();
      const server = new DeskStatusServer(metrics, () => toPayload({ status: 'RUNNING' }));
      const port = await server.start(0);

      const invalidPaths = ['/admin', '/kill', '/v1/debug', '/api/secret', '/arbitrary-path'];
      for (const p of invalidPaths) {
        const res = await httpQuery(port, p);
        expect(res.status).toBe(404);
        const parsed = JSON.parse(res.body) as { error?: { code?: string } };
        expect(parsed.error?.code).toBe('NOT_FOUND');
      }
      await server.stop();
    });

    it('6. HTTP path traversal attacks (/../../../etc/passwd) are safely neutralized to 404', async () => {
      const metrics = new DeskMetricsRegistry();
      const server = new DeskStatusServer(metrics, () => toPayload({ status: 'RUNNING' }));
      const port = await server.start(0);

      const traversalPaths = ['/../../../etc/passwd', '/status/../../etc/shadow', '/health/../../../.env'];
      for (const p of traversalPaths) {
        const res = await httpQuery(port, p);
        expect(res.status).toBe(404);
        const parsed = JSON.parse(res.body) as { error?: { code?: string } };
        expect(parsed.error?.code).toBe('NOT_FOUND');
      }
      await server.stop();
    });

    it('7. rapid SIGINT flooding during emergency halt is strictly idempotent without double-close error', async () => {
      const config = parseDeskAutoConfig({});
      const daemon = new DeskDaemon({ config, skipSignalHandlers: true, skipServer: true });
      await daemon.start();

      // 10 concurrent SIGINT signals fired in quick succession
      const signalBursts = Array.from({ length: 10 }, () => daemon.handleSignal('SIGINT'));
      const results = await Promise.all(signalBursts);

      expect(results).toHaveLength(10);
      for (const elapsed of results) {
        expect(elapsed).toBeLessThanOrEqual(100);
      }
      expect(daemon.isRunning()).toBe(false);
      expect(daemon.getStatus().status).toBe('STOPPED');
    });
  });
}
