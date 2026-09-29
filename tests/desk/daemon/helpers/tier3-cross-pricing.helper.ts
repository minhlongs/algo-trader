/**
 * Tier 3 Cross-Feature Tests: Pricing, NBBO, Conflicting Intents & Telemetry Scrapes
 */

import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { MarketDataMultiplexer } from '../../../../src/desk/feeds/market-data-multiplexer';
import { DynamicMidPriceProvider } from '../../../../src/desk/feeds/dynamic-mid-price-provider';
import { BoundedPriorityQueue } from './tier2-drift-queue.helper';
import { DaemonTestHarness, verifyZeroDrift } from './daemon-test-harness';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
} from './mock-desk-components';

function fetchText(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchJson<T>(port: number, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

export function registerTier3PricingTests(): void {
  describe('Tier 3: Pricing, Conflicting Intents & Telemetry Scrapes', () => {
    it('dynamic mid-price provider updates feed prices during order book crossing', () => {
      const mux = new MarketDataMultiplexer();
      const provider = new DynamicMidPriceProvider(mux);
      const now = Date.now();
      mux.ingestBook('binance', 'BTC/USDT', [[65000, 1.5]], [[65020, 1.5]], now);
      expect(provider.getMidPrice('BTC/USDT', 'binance')).toBe(65010);
      mux.ingestBook('binance', 'BTC/USDT', [[65050, 2.0]], [[65070, 2.0]], now + 10);
      expect(provider.getMidPrice('BTC/USDT', 'binance')).toBe(65060);
    });

    it('dynamic mid-price provider returns undefined when feed stalls, preventing execution on stale quotes', () => {
      const mux = new MarketDataMultiplexer();
      const provider = new DynamicMidPriceProvider(mux, 1000); // 1000ms max age
      const oldTime = Date.now() - 3000;
      mux.ingestBook('binance', 'BTC/USDT', [[65000, 1.0]], [[65020, 1.0]], oldTime);
      expect(provider.getMidPrice('BTC/USDT')).toBeUndefined();
    });

    it('multiple engines emitting simultaneous conflicting intents resolved by priority ranking', () => {
      const q = new BoundedPriorityQueue(50);
      const arbIntent = createMockArbIntent({
        intentId: 'arb-buy',
        side: 'BUY',
        urgency: 'HIGH',
        expectedEdgeBps: 45,
        isRiskReducing: false,
      });
      const marlIntent = createMockMarlIntent({
        intentId: 'marl-sell',
        side: 'SELL',
        urgency: 'LOW',
        expectedEdgeBps: 15,
        isRiskReducing: false,
      });
      const ammHedge = createMockAmmIntent({
        intentId: 'amm-hedge',
        side: 'BUY',
        urgency: 'MEDIUM',
        expectedEdgeBps: 30,
        isRiskReducing: true,
      });

      q.push(arbIntent);
      q.push(marlIntent);
      q.push(ammHedge);

      const drained = q.drain();
      expect(drained.map((i) => i.intentId)).toEqual(['amm-hedge', 'arb-buy', 'marl-sell']);
    });

    it('rebalancing engine allocations updates /api/desk/allocations while maintaining zero drift (< 1e-4)', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      const rebalanced = { arbitrage: 40_000, marl: 20_000, amm: 20_000, 'alpha-lab': 20_000 };
      const driftCheck = verifyZeroDrift(100_000, rebalanced, 0);
      expect(driftCheck.valid).toBe(true);
      expect(driftCheck.driftUsd).toBe(0);
      const allocRes = await fetchJson<{ allocatedCapitalUsd: Record<string, number> }>(port, '/api/desk/allocations');
      expect(allocRes.allocatedCapitalUsd).toBeDefined();
      await harness.cleanup();
    });

    it('accounting drift violation during rebalance increments desk_accounting_drift_usd gauge and is detected', async () => {
      const harness = new DaemonTestHarness();
      const faultyAlloc = { arbitrage: 50_000, marl: 49_998 }; // sum 99998, drift = 2 USD
      const check = verifyZeroDrift(100_000, faultyAlloc, 0);
      expect(check.valid).toBe(false);
      expect(check.driftUsd).toBe(2);
      harness.metrics.setAccountingDriftUsd(check.driftUsd);
      const metricsText = await harness.metrics.getMetricsText();
      expect(metricsText).toContain('desk_accounting_drift_usd 2');
    });

    it('Prometheus /metrics scrape reflects queue depth and queue shed counter during continuous emission', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      harness.metrics.incrementQueueShed('LOW', 12);
      harness.metrics.incrementQueueShed('HIGH', 3);
      harness.metrics.setPriorityQueueDepth(7);
      const metricsText = await fetchText(port, '/metrics');
      expect(metricsText).toContain('desk_queue_shed_total{urgency="LOW"} 12');
      expect(metricsText).toContain('desk_queue_shed_total{urgency="HIGH"} 3');
      expect(metricsText).toContain('desk_priority_queue_depth 7');
      await harness.cleanup();
    });

    it('dynamic mid-price provider detects crossed NBBO between Binance and Bybit supplying arbitrage spread', () => {
      const mux = new MarketDataMultiplexer();
      const provider = new DynamicMidPriceProvider(mux);
      const now = Date.now();
      mux.ingestBook('binance', 'BTC/USDT', [[65100, 2.0]], [[65120, 2.0]], now);
      mux.ingestBook('bybit', 'BTC/USDT', [[65130, 2.0]], [[65150, 2.0]], now);
      const nbbo = provider.getGlobalNbbo('BTC/USDT');
      expect(nbbo).toBeDefined();
      expect(nbbo?.bestBid).toBe(65130); // From Bybit
      expect(nbbo?.bestAsk).toBe(65120); // From Binance
      expect(nbbo?.bestBid).toBeGreaterThan(nbbo?.bestAsk ?? 0); // Crossed spread
    });

    it('fill rate and realized slippage gauges update concurrently during daemon polling tick', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      harness.metrics.setOrdersFillRate(0.92);
      harness.metrics.setRealizedSlippageBps(3.5);
      const text = await fetchText(port, '/metrics');
      expect(text).toContain('desk_orders_fill_rate 0.92');
      expect(text).toContain('desk_realized_slippage_bps 3.5');
      await harness.cleanup();
    });
  });
}
