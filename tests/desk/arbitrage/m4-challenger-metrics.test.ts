/**
 * Milestone 4 Challenger Empirical Stress Test Suite: ArbitrageMetrics & Telemetry
 *
 * Empirical adversarial stress testing of:
 * - High-throughput concurrent order emissions (500-1000 orders across venues/statuses)
 * - Race condition detection, zero memory leaks, zero NaN counter increments
 * - Histogram bucket edge values (0ms, 1ms, 2ms, 5000ms, 10000ms; -100 bps, 0 bps, 200 bps)
 * - Multi-tenant and multi-strategy metric label cardinality scaling and serialization
 * - Active executions gauge concurrency invariants (zero drift after parallel execution)
 * - PnL sign categorization and numeric extreme resilience
 *
 * @module tests/desk/arbitrage/m4-challenger-metrics.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import client from 'prom-client';
import crypto from 'node:crypto';
import {
  ArbitrageMetrics,
  arbOrdersTotal,
  arbExecutionLatencyMs,
  arbSlippageBps,
  arbPnlUsd,
  recordArbOrder,
  recordArbLatency,
  recordArbSlippage,
  recordArbPnl,
} from '../../../src/desk/arbitrage/arbitrage-metrics';
import { ArbitrageEngine, type ArbitrageOpportunity } from '../../../src/desk/arbitrage/arbitrage-engine';
import { register as platformRegister } from '../../../src/platform/middleware/prometheus-registry';
import type {
  IExchangeConnector,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeBalance,
} from '../../../src/desk/arbitrage/connectors/types';

// Mock audit-log DB persistence to prevent ECONNREFUSED in sandbox while testing
vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockImplementation((ip: string) =>
    crypto.createHash('sha256').update(ip).digest('hex'),
  ),
}));

describe('Milestone 4 Challenger: Empirical Telemetry & Metrics Stress Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: High-Throughput Concurrent Order Emissions & Invariants
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. High-Throughput Concurrent Emissions (500+ Orders)', () => {
    it('handles 500 concurrent order emissions across random venues and statuses without race conditions or lost counts', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'stress_' });

      const venues = ['binance', 'bybit', 'kucoin', 'polymarket', 'okx'] as const;
      const statuses = ['submitted', 'filled', 'unwound', 'failed', 'risk_rejected'] as const;
      const strategies = ['cross-exchange', 'triangular', 'dex-cex', 'latency-arb'] as const;

      const orderCount = 500;
      const expectedTallies: Record<string, number> = {};

      // Seed deterministic pseudo-random distribution
      const emissions: Array<{ venue: string; status: string; strategy: string }> = [];
      for (let i = 0; i < orderCount; i++) {
        const venue = venues[i % venues.length];
        const status = statuses[(i * 3 + 1) % statuses.length];
        const strategy = strategies[(i * 7 + 2) % strategies.length];
        emissions.push({ venue, status, strategy });

        const key = `${venue}|${status}|${strategy}`;
        expectedTallies[key] = (expectedTallies[key] ?? 0) + 1;
      }

      // Execute 500 emissions concurrently via Promise.all
      await Promise.all(
        emissions.map(async (em) => {
          // Microtask yield to maximize thread interleaving
          await Promise.resolve();
          metrics.recordOrder(em.venue, em.status, em.strategy);
        }),
      );

      const output = await metrics.getMetrics();

      // Invariant 1: No NaN values in metric output
      expect(output.includes('NaN')).toBe(false);

      // Invariant 2: Total orders in metrics text equals exactly 500
      let totalParsedOrders = 0;
      const orderLines = output.split('\n').filter((l) => l.startsWith('stress_orders_total{'));

      expect(orderLines.length).toBeGreaterThan(0);

      for (const line of orderLines) {
        const match = line.match(/\s+(\d+(\.\d+)?)$/);
        expect(match).not.toBeNull();
        if (match) {
          totalParsedOrders += parseFloat(match[1]);
        }
      }

      expect(totalParsedOrders).toBe(orderCount);

      // Invariant 3: Verify individual bucket counts match expectations
      for (const [key, expectedVal] of Object.entries(expectedTallies)) {
        const [venue, status, strategy] = key.split('|');
        const expectedSubstring = `stress_orders_total{venue="${venue}",status="${status}",strategy="${strategy}"} ${expectedVal}`;
        expect(output).toContain(expectedSubstring);
      }
    });

    it('enforces active execution gauge invariance under 500 concurrent in-flight executions', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'gauge_' });

      const concurrency = 500;
      let peakRecorded = 0;

      // 500 tasks increment, inspect, and then decrement
      await Promise.all(
        Array.from({ length: concurrency }).map(async (_, idx) => {
          metrics.incActiveExecutions();

          // Stagger slightly with microtask pauses
          if (idx % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1));
          } else {
            await Promise.resolve();
          }

          // Sample at mid-flight
          if (idx === concurrency - 1) {
            const midText = await metrics.getMetrics();
            const match = midText.match(/gauge_active_executions\s+(\d+)/);
            if (match) {
              peakRecorded = parseInt(match[1], 10);
            }
          }

          metrics.decActiveExecutions();
        }),
      );

      const finalText = await metrics.getMetrics();

      // Invariant: Gauge must return exactly to 0 after all executions complete
      expect(finalText).toContain('gauge_active_executions 0');
      expect(peakRecorded).toBeGreaterThan(0);
      expect(finalText.includes('NaN')).toBe(false);
    });

    it('processes 1,000 interleaved operations across all telemetry channels simultaneously', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'mixed_' });

      const iterations = 1000;
      const tasks: Promise<void>[] = [];

      for (let i = 0; i < iterations; i++) {
        const mod = i % 5;
        if (mod === 0) {
          tasks.push(
            (async () => {
              await Promise.resolve();
              metrics.recordOrder('binance', 'filled', 'cross-exchange');
            })(),
          );
        } else if (mod === 1) {
          tasks.push(
            (async () => {
              await Promise.resolve();
              metrics.recordExecutionLatency('bybit', 'cross-exchange', (i * 7) % 500);
            })(),
          );
        } else if (mod === 2) {
          tasks.push(
            (async () => {
              await Promise.resolve();
              metrics.recordSlippage('kucoin', 'BTC/USDT', (i % 30) - 10);
            })(),
          );
        } else if (mod === 3) {
          tasks.push(
            (async () => {
              await Promise.resolve();
              metrics.recordPnl('cross-exchange', (i % 2 === 0 ? 1 : -1) * (i * 0.5));
            })(),
          );
        } else {
          tasks.push(
            (async () => {
              await Promise.resolve();
              metrics.recordUnwind('polymarket', i % 2 === 0);
            })(),
          );
        }
      }

      await Promise.all(tasks);

      const output = await metrics.getMetrics();

      // Verify no NaN or corrupt formatting
      expect(output.includes('NaN')).toBe(false);
      expect(output).toContain('mixed_orders_total');
      expect(output).toContain('mixed_execution_latency_ms_count{venue="bybit",strategy="cross-exchange"} 200');
      expect(output).toContain('mixed_slippage_bps_count{venue="kucoin",symbol="BTC/USDT"} 200');
      expect(output).toContain('mixed_unwinds_total');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: Histogram Bucket Edge Values & Extreme Boundary Probing
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Histogram Bucket Edge Values & Extreme Boundaries', () => {
    it('classifies latency bucket edge values correctly (0ms, 1ms, 2ms, 5000ms, 10000ms, negative)', async () => {
      const customRegistry = new client.Registry();
      const latencyHistogram = new client.Histogram({
        name: 'test_latency_ms',
        help: 'Test latency',
        labelNames: ['test_case'] as const,
        buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
        registers: [customRegistry],
      });

      // 1. Edge: 0ms (immediate / zero measured latency) -> must be in le="2"
      latencyHistogram.observe({ test_case: 'zero_ms' }, Math.max(0, 0));

      // 2. Edge: 1ms (sub-bucket latency) -> must be in le="2"
      latencyHistogram.observe({ test_case: 'one_ms' }, Math.max(0, 1));

      // 3. Edge: 2ms (exact bucket boundary) -> must be in le="2"
      latencyHistogram.observe({ test_case: 'boundary_2ms' }, Math.max(0, 2));

      // 4. Edge: 2.001ms (just over bucket boundary) -> must NOT be in le="2", but in le="5"
      latencyHistogram.observe({ test_case: 'just_over_2ms' }, Math.max(0, 2.001));

      // 5. Edge: 5000ms (exact maximum explicit bucket) -> must be in le="5000"
      latencyHistogram.observe({ test_case: 'boundary_5000ms' }, Math.max(0, 5000));

      // 6. Edge: 5000.1ms (just over maximum explicit bucket) -> must be in +Inf, NOT in le="5000"
      latencyHistogram.observe({ test_case: 'over_5000ms' }, Math.max(0, 5000.1));

      // 7. Edge: 10000ms (extreme outlier / timeout latency) -> must be in +Inf
      latencyHistogram.observe({ test_case: 'extreme_10000ms' }, Math.max(0, 10000));

      // 8. Edge: -50ms (negative latency anomaly / clock skew) -> clamped via Math.max(0, -50) to 0 -> in le="2"
      latencyHistogram.observe({ test_case: 'negative_skew' }, Math.max(0, -50));

      const output = await customRegistry.metrics();

      // Check 0ms: le="2" is 1
      expect(output).toContain('test_latency_ms_bucket{le="2",test_case="zero_ms"} 1');

      // Check 1ms: le="2" is 1
      expect(output).toContain('test_latency_ms_bucket{le="2",test_case="one_ms"} 1');

      // Check 2ms: le="2" is 1
      expect(output).toContain('test_latency_ms_bucket{le="2",test_case="boundary_2ms"} 1');

      // Check 2.001ms: le="2" is 0, le="5" is 1
      expect(output).toContain('test_latency_ms_bucket{le="2",test_case="just_over_2ms"} 0');
      expect(output).toContain('test_latency_ms_bucket{le="5",test_case="just_over_2ms"} 1');

      // Check 5000ms: le="5000" is 1
      expect(output).toContain('test_latency_ms_bucket{le="5000",test_case="boundary_5000ms"} 1');

      // Check 5000.1ms: le="5000" is 0, +Inf is 1
      expect(output).toContain('test_latency_ms_bucket{le="5000",test_case="over_5000ms"} 0');
      expect(output).toContain('test_latency_ms_bucket{le="+Inf",test_case="over_5000ms"} 1');

      // Check 10000ms: le="5000" is 0, +Inf is 1
      expect(output).toContain('test_latency_ms_bucket{le="5000",test_case="extreme_10000ms"} 0');
      expect(output).toContain('test_latency_ms_bucket{le="+Inf",test_case="extreme_10000ms"} 1');

      // Check negative latency clamped to 0: le="2" is 1
      expect(output).toContain('test_latency_ms_bucket{le="2",test_case="negative_skew"} 1');
    });

    it('classifies slippage histogram edge values correctly (-100 bps, 0 bps, 200 bps, extreme)', async () => {
      const customRegistry = new client.Registry();
      const slippageHistogram = new client.Histogram({
        name: 'test_slippage_bps',
        help: 'Test slippage',
        labelNames: ['test_case'] as const,
        buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200],
        registers: [customRegistry],
      });

      // 1. Extreme negative slippage: -100 bps (major price improvement) -> <= -50
      slippageHistogram.observe({ test_case: 'neg_100' }, -100);

      // 2. Exact negative boundary: -50 bps
      slippageHistogram.observe({ test_case: 'neg_50' }, -50);

      // 3. Intermediate negative: -25 bps -> not in le="-50", but in le="-20"
      slippageHistogram.observe({ test_case: 'neg_25' }, -25);

      // 4. Exact zero slippage: 0 bps -> in le="0", not in le="-5"
      slippageHistogram.observe({ test_case: 'zero_bps' }, 0);

      // 5. Positive boundary: 200 bps -> in le="200"
      slippageHistogram.observe({ test_case: 'pos_200' }, 200);

      // 6. Extreme positive slippage: 500 bps -> exceeds 200, only in +Inf
      slippageHistogram.observe({ test_case: 'pos_500' }, 500);

      const output = await customRegistry.metrics();

      // -100 bps: <= -50
      expect(output).toContain('test_slippage_bps_bucket{le="-50",test_case="neg_100"} 1');

      // -50 bps: <= -50
      expect(output).toContain('test_slippage_bps_bucket{le="-50",test_case="neg_50"} 1');

      // -25 bps: NOT <= -50, but <= -20
      expect(output).toContain('test_slippage_bps_bucket{le="-50",test_case="neg_25"} 0');
      expect(output).toContain('test_slippage_bps_bucket{le="-20",test_case="neg_25"} 1');

      // 0 bps: NOT <= -5, but <= 0
      expect(output).toContain('test_slippage_bps_bucket{le="-5",test_case="zero_bps"} 0');
      expect(output).toContain('test_slippage_bps_bucket{le="0",test_case="zero_bps"} 1');

      // 200 bps: <= 200
      expect(output).toContain('test_slippage_bps_bucket{le="100",test_case="pos_200"} 0');
      expect(output).toContain('test_slippage_bps_bucket{le="200",test_case="pos_200"} 1');

      // 500 bps: NOT <= 200, in +Inf
      expect(output).toContain('test_slippage_bps_bucket{le="200",test_case="pos_500"} 0');
      expect(output).toContain('test_slippage_bps_bucket{le="+Inf",test_case="pos_500"} 1');
    });

    it('probes negative slippage handling between ArbitrageMetrics instance and global helper', async () => {
      // Challenger investigation: ArbitrageMetrics.recordSlippage line 410 uses Math.max(0, slippageBps),
      // which clamps negative slippage to 0 in its instance histogram,
      // whereas recordArbSlippage preserves negative slippage in arbSlippageBps.
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'probe_' });

      // Record -30 bps via ArbitrageMetrics instance method
      metrics.recordSlippage('binance', 'BTC/USDT', -30);

      const instanceOutput = await metrics.getMetrics();
      // Because of Math.max(0, -30), instance slippage was observed as 0:
      // So le="-50" is 0, le="-20" is 0, le="-10" is 0, le="0" is 1
      expect(instanceOutput).toContain('probe_slippage_bps_bucket{le="-50",venue="binance",symbol="BTC/USDT"} 0');
      expect(instanceOutput).toContain('probe_slippage_bps_bucket{le="-20",venue="binance",symbol="BTC/USDT"} 0');
      expect(instanceOutput).toContain('probe_slippage_bps_bucket{le="0",venue="binance",symbol="BTC/USDT"} 1');

      // In contrast, recordArbSlippage directly preserves the negative value:
      recordArbSlippage({
        strategyType: 'cross-exchange',
        venue: 'okx_probe',
        symbol: 'ETH/USDT',
        side: 'buy',
        slippageBps: -30,
      });

      const globalOutput = await platformRegister.metrics();
      expect(globalOutput).toContain('arb_slippage_bps_bucket{le="-20",strategy_type="cross-exchange",venue="okx_probe",symbol="ETH/USDT",side="buy"} 1');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 3: Multi-Tenant & Multi-Strategy Label Cardinality & Memory Scaling
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Multi-Tenant & Multi-Strategy Label Cardinality Scaling', () => {
    it('scales to 1,250 unique label combinations without memory leaks or serialization failure', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'cardinality_' });

      const tenantStrategies = Array.from({ length: 25 }, (_, i) => `tenant_${i}_strat`);
      const venues = ['binance', 'bybit', 'kucoin', 'polymarket', 'okx'];
      const statuses = ['filled', 'unwound', 'failed', 'submitted', 'cancelled'];

      const initialMemory = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      // Create 25 * 5 * 5 = 625 label combinations, each recorded twice
      for (const strat of tenantStrategies) {
        for (const venue of venues) {
          for (const status of statuses) {
            metrics.recordOrder(venue, status, strat);
            metrics.recordOrder(venue, status, strat);
          }
        }
      }

      const insertionDuration = performance.now() - startTime;
      expect(insertionDuration).toBeLessThan(1000); // Must record 1,250 operations in < 1 second

      // Measure Prometheus scrape serialization performance
      const scrapeStartTime = performance.now();
      const metricsText = await metrics.getMetrics();
      const scrapeDuration = performance.now() - scrapeStartTime;

      expect(scrapeDuration).toBeLessThan(200); // Serialization of 625 series must complete under 200ms
      expect(metricsText.length).toBeGreaterThan(10000);

      // Verify each series recorded value of 2
      expect(metricsText).toContain('cardinality_orders_total{venue="binance",status="filled",strategy="tenant_0_strat"} 2');
      expect(metricsText).toContain('cardinality_orders_total{venue="okx",status="cancelled",strategy="tenant_24_strat"} 2');

      // Verify heap consumption did not expand uncontrollably (< 30 MB delta)
      const finalMemory = process.memoryUsage().heapUsed;
      const heapDeltaMb = (finalMemory - initialMemory) / (1024 * 1024);
      expect(heapDeltaMb).toBeLessThan(30);

      // Reset registry and ensure all time series are cleared
      metrics.reset();
      const afterResetText = await metrics.getMetrics();
      expect(afterResetText).not.toContain('cardinality_orders_total{');
    });

    it('sanitizes and safely encodes unusual label characters (slashes, colons, unicode)', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'escape_' });

      // Special symbols and characters common in crypto (e.g. perp contracts, slash pairs, colons)
      const specialSymbols = [
        'BTC/USDT',
        'ETH-PERP',
        'SOL/USD:USDC',
        '1000PEPE/USDT',
        'ARB/USDT@bybit',
      ];

      for (const symbol of specialSymbols) {
        metrics.recordSlippage('binance', symbol, 2.5);
      }

      const output = await metrics.getMetrics();

      // Prometheus exposition format must escape or accept standard printable ASCII cleanly
      for (const symbol of specialSymbols) {
        expect(output).toContain(`symbol="${symbol}"`);
      }
      expect(output.includes('NaN')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 4: PnL Sign Classification & Numeric Extreme Probing
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. PnL Sign Classification & Numeric Extremes', () => {
    it('classifies positive, negative, and zero PnL accurately without sign confusion', async () => {
      const customRegistry = new client.Registry();
      const metrics = new ArbitrageMetrics({ registry: customRegistry, prefix: 'pnl_' });

      // 1. Positive PnL -> 'profit'
      metrics.recordPnl('cross-exchange', 250.75);

      // 2. Negative PnL -> 'loss'
      metrics.recordPnl('cross-exchange', -142.25);

      // 3. Exactly Zero PnL -> 'profit' (>= 0 convention)
      metrics.recordPnl('cross-exchange', 0);

      // 4. Large PnL -> $10,000,000
      metrics.recordPnl('macro-arb', 10000000);

      // 5. Fractional Micro-PnL -> $0.0001
      metrics.recordPnl('micro-arb', 0.0001);

      const output = await metrics.getMetrics();

      expect(output).toContain('pnl_pnl_usd{strategy="cross-exchange",result="profit"} 250.75');
      expect(output).toContain('pnl_pnl_usd{strategy="cross-exchange",result="loss"} 142.25');
      expect(output).toContain('pnl_pnl_usd{strategy="macro-arb",result="profit"} 10000000');
      expect(output).toContain('pnl_pnl_usd{strategy="micro-arb",result="profit"} 0.0001');
      expect(output.includes('NaN')).toBe(false);
    });

    it('probes standalone recordArbPnl handling of overloaded signatures', async () => {
      // Signature 1: Object
      recordArbPnl({
        strategyType: 'poly-cex',
        venuePair: 'polymarket-binance',
        result: 'win',
        pnlUsd: 88.5,
      });

      // Signature 2: Positional with result string
      recordArbPnl('triangular', 'bybit-okx', 'win', 45.0);

      // Signature 3: Positional with number in 2nd slot
      recordArbPnl('dex-cex', 120.0);

      const output = await platformRegister.metrics();

      expect(output).toContain('arb_pnl_usd{strategy_type="poly-cex",venue_pair="polymarket-binance",result="win"} 88.5');
      expect(output).toContain('arb_pnl_usd{strategy_type="triangular",venue_pair="bybit-okx",result="win"} 45');
      expect(output).toContain('arb_pnl_usd{strategy_type="dex-cex",venue_pair="cross-venue",result="win"} 120');
    });

    it('probes undefined and degenerate numeric inputs to identify defensive vulnerabilities', async () => {
      // 1. Positional signature defensively defaults undefined latency to 0
      recordArbLatency('safe-test-pos', 'roundtrip', 'success', undefined);

      const output = await platformRegister.metrics();
      expect(output).toContain('arb_execution_latency_ms_bucket{le="2",strategy_type="safe-test-pos",phase="roundtrip",status="success"}');
      expect(output.includes('NaN')).toBe(false);

      // 2. Object signature lacks ?? 0 fallback (Math.max(0, undefined) -> NaN), throwing TypeError
      expect(() => {
        recordArbLatency({
          strategyType: 'vulnerable-obj',
          phase: 'roundtrip',
          status: 'success',
          latencyMs: undefined as unknown as number,
        });
      }).toThrow('Value is not a valid number: NaN');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 5: Master ArbitrageEngine Concurrent Telemetry Integration
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Master ArbitrageEngine Concurrent Telemetry Integration', () => {
    const createMockConnector = (venue: string): IExchangeConnector => ({
      exchangeId: venue,
      placeOrder: vi.fn(async (params: ExchangeOrderParams): Promise<ExchangeOrderResult> => ({
        orderId: `ord-${venue}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        clientOrderId: params.clientOrderId,
        exchange: venue,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 50000,
        amount: params.amount,
        filled: params.amount,
        remaining: 0,
        status: 'closed',
        fee: { amount: 0.5, currency: 'USDT' },
        timestamp: Date.now(),
      })),
      cancelOrder: vi.fn(async () => true),
      fetchOrder: vi.fn(),
      fetchBalance: vi.fn(async (): Promise<ExchangeBalance> => ({
        USDT: { free: 1000000, used: 0, total: 1000000 },
        BTC: { free: 100, used: 0, total: 100 },
      })),
      getLatencyMs: vi.fn(async () => 12),
    });

    it('maintains valid cryptographic audit chain when opportunities are executed sequentially', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine((v) => (v === 'binance' ? binance : bybit), {
        mode: 'dry-run',
        minNetProfitBps: 10,
        riskConfig: {
          capitalUsdc: 500000,
          maxPerTradeNotionalUsd: 10000,
        },
      });

      const oppCount = 10;
      for (let i = 0; i < oppCount; i++) {
        const report = await engine.executeOpportunity({
          id: `opp-seq-${i}`,
          symbol: 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          buyPrice: 50000,
          sellPrice: 50250,
          tradeSize: 0.05,
          spreadBps: 50,
          netProfitBps: 20,
        });
        expect(report?.state).toBe('FILLED');
      }

      // Sequential verification must be completely valid
      const verification = engine.auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(oppCount * 4);
    });

    it('coordinates telemetry across 50 concurrent engine executions while exposing audit log race condition', async () => {
      const binance = createMockConnector('binance');
      const bybit = createMockConnector('bybit');

      const engine = new ArbitrageEngine((v) => (v === 'binance' ? binance : bybit), {
        mode: 'dry-run',
        minNetProfitBps: 10,
        riskConfig: {
          capitalUsdc: 500000,
          maxPerTradeNotionalUsd: 10000,
        },
      });

      const oppCount = 50;
      const opportunities: ArbitrageOpportunity[] = Array.from({ length: oppCount }, (_, i) => ({
        id: `opp-stress-${i}`,
        symbol: 'BTC/USDT',
        buyVenue: 'binance',
        sellVenue: 'bybit',
        buyPrice: 50000,
        sellPrice: 50250,
        tradeSize: 0.05,
        spreadBps: 50,
        netProfitBps: 20,
        confidence: 0.9,
        timestamp: Date.now() + i,
      }));

      // Execute 50 opportunities concurrently through ArbitrageEngine
      const reports = await Promise.all(opportunities.map((opp) => engine.executeOpportunity(opp)));

      // Invariant 1: All 50 opportunities were successfully executed to FILLED
      expect(reports.length).toBe(oppCount);
      for (const report of reports) {
        expect(report).not.toBeNull();
        expect(report?.state).toBe('FILLED');
      }

      // Invariant 2: Active execution counter returned to 0
      const status = engine.getStatus();
      expect(status.activeExecutions).toBe(0);

      // Invariant 3: Prometheus metrics reflect 50 trades * 2 legs = 100 orders without NaN
      const metricsText = await engine.metrics.getMetrics();
      expect(metricsText).toContain('arb_orders_total');
      expect(metricsText).toContain('arb_active_executions 0');
      expect(metricsText.includes('NaN')).toBe(false);

      // Invariant 4 (EMPIRICAL CHALLENGER FINDING):
      // ArbitrageAuditLogger.appendRow is not concurrency-safe:
      // Awaiting logAudit yields control between sequenceNumber assignment and row push,
      // resulting in broken sequence numbers under concurrent load.
      const verification = engine.auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.reason).toMatch(/Broken sequence|Previous hash mismatch/);
    });
  });
});
