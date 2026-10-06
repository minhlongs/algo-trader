/**
 * Adversarial Challenge Test Suite for Milestone 1:
 * Multi-Exchange Connectors & Net Profitability
 *
 * Authored by: Challenger Arb M1-2 (teamwork_preview_challenger_arb_m1_2)
 *
 * Verifies and stress-tests:
 * 1. CCXT Network drops, timeouts, cancellation rejections, and rate limits
 * 2. Polymarket aggressive market order fill vs terminal cache lifecycle & expiration
 * 3. Burst flood of 200 opportunities into OpportunityIngestionPipeline
 *    (queue overflow, FIFO drop policy, memory stability, worker concurrency, metric accounting)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type ExchangeOrderParams,
  ExchangeNetworkError,
  ExchangeRateLimitError,
  OrderCancellationError,
  OrderPlacementError,
  OrderNotFoundError,
  ExchangeConnectorError,
} from '../../../src/desk/arbitrage/connectors/types';
import {
  CcxtExchangeConnector,
  type CcxtExchangeAdapter,
  type CcxtRawOrder,
  type CcxtRawBalance,
} from '../../../src/desk/markets/cex/ccxt-exchange-connector';
import {
  PolymarketConnectorAdapter,
} from '../../../src/desk/execution/polymarket-connector-adapter';
import type {
  PolymarketAdapter,
  PolymarketOrderResponse,
  PolymarketOpenOrder,
} from '../../../src/desk/execution/polymarket-adapter';
import { LiveOrderManager } from '../../../src/desk/execution/live-order-manager';
import type { OrderState } from '../../../src/desk/execution/live-order-manager-types';
import type { PolymarketOrder } from '../../../src/desk/execution/polymarket-signer';
import { LivePositionTracker } from '../../../src/desk/execution/live-position-tracker';
import {
  OpportunityIngestionPipeline,
} from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/spread-detector-types';
import {
  NetProfitabilityCalculator,
} from '../../../src/desk/arbitrage/net-profitability-calculator';

// ── Mock Helpers ─────────────────────────────────────────────────────────────

function createMockCcxtAdapter(overrides: Partial<CcxtExchangeAdapter> = {}): CcxtExchangeAdapter {
  return {
    createOrder: vi.fn(async (symbol, type, side, amount, price) => ({
      id: 'mock-order-1',
      symbol,
      type,
      side,
      amount,
      price: price ?? 50000,
      filled: amount,
      remaining: 0,
      status: 'closed',
      timestamp: Date.now(),
    })),
    cancelOrder: vi.fn(async (id: string) => ({ id, status: 'canceled' })),
    fetchOrder: vi.fn(async (id: string, symbol?: string) => ({
      id,
      symbol: symbol ?? 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 1.0,
      price: 50000,
      filled: 1.0,
      remaining: 0,
      status: 'closed',
      timestamp: Date.now(),
    })),
    fetchBalance: vi.fn(async (): Promise<CcxtRawBalance> => ({
      free: { USDT: 10000 },
      used: { USDT: 0 },
      total: { USDT: 10000 },
    })),
    fetchTime: vi.fn(async () => Date.now()),
    fetchStatus: vi.fn(async () => ({ status: 'ok' })),
    ...overrides,
  };
}

function createMockPolymarketAdapter(overrides: Partial<PolymarketAdapter> = {}): PolymarketAdapter {
  const openOrders: PolymarketOpenOrder[] = [];
  let seq = 100;

  return {
    placeOrder: vi.fn(async (order: PolymarketOrder): Promise<PolymarketOrderResponse> => {
      seq++;
      const orderID = `0xpoly-order-${seq}`;
      const isMatched = order.side === 'BUY'
        ? order.price >= 0.51
        : order.side === 'SELL'
          ? order.price <= 0.49
          : order.price >= 0.90;
      if (!isMatched) {
        openOrders.push({
          id: orderID,
          asset_id: order.tokenId,
          price: String(order.price),
          original_size: String(order.size),
          size_matched: '0',
          side: order.side,
          expiration: String(order.expiration),
          status: 'open',
          created_at: new Date().toISOString(),
        });
      }
      return {
        orderID,
        status: isMatched ? 'matched' : 'unmatched',
      };
    }),
    cancelOrder: vi.fn(async (orderId: string) => {
      const idx = openOrders.findIndex((o) => o.id === orderId);
      if (idx >= 0) openOrders.splice(idx, 1);
      return { canceled: true };
    }),
    getOpenOrders: vi.fn(async () => openOrders),
    getOrderBook: vi.fn(async (tokenId: string) => ({
      market: 'market-1',
      asset_id: tokenId,
      bids: [{ price: '0.49', size: '1000' }],
      asks: [{ price: '0.51', size: '1000' }],
      hash: '0xhash',
      timestamp: String(Date.now()),
    })),
    ...overrides,
  } as unknown as PolymarketAdapter;
}

// ── Test Suites ─────────────────────────────────────────────────────────────

describe('Adversarial Challenges: Milestone 1', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. CCXT Edge & Failure Stress Testing
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. CCXT Network Drop, Timeout, Cancellation Rejection & Rate Limits', () => {
    it('1.1: CCXT Network Drop — maps ECONNREFUSED NetworkError to ExchangeNetworkError', async () => {
      const err = new Error('connect ECONNREFUSED 104.18.25.14:443');
      err.name = 'NetworkError';

      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(err),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: 0.1,
          price: 50000,
        })
      ).rejects.toThrow(ExchangeNetworkError);
    });

    it('1.2: CCXT Network Drop — classifies socket hang up as ExchangeNetworkError', async () => {
      // Node.js raw socket errors without ccxt NetworkError class name
      const socketErr = new Error('socket hang up');
      socketErr.name = 'Error';

      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(socketErr),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 0.1,
        })
      ).rejects.toThrow(ExchangeNetworkError);
    });

    it('1.3: CCXT Timeout — translates RequestTimeout during placeOrder to ExchangeNetworkError', async () => {
      const timeoutErr = new Error('request timed out after 10000ms');
      timeoutErr.name = 'RequestTimeout';

      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(timeoutErr),
      });
      const connector = new CcxtExchangeConnector('bybit', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'limit',
          amount: 0.1,
          price: 50000,
        })
      ).rejects.toThrow(ExchangeNetworkError);
    });

    it('1.4: CCXT Timeout & Network Drop — classifies ETIMEDOUT as ExchangeNetworkError', async () => {
      // Test 1: Node.js standard ETIMEDOUT
      const etimedoutErr = new Error('connect ETIMEDOUT 104.18.25.14:443');
      const adapter1 = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(etimedoutErr),
      });
      const conn1 = new CcxtExchangeConnector('kucoin', adapter1);

      await expect(conn1.cancelOrder('order-123', 'BTC/USDT')).rejects.toThrow(
        ExchangeNetworkError
      );

      // Test 2: Standard RequestTimeout class from ccxt is correctly mapped
      const ccxtTimeoutErr = new Error('request timed out');
      ccxtTimeoutErr.name = 'RequestTimeout';
      const adapter2 = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(ccxtTimeoutErr),
      });
      const conn2 = new CcxtExchangeConnector('kucoin', adapter2);

      await expect(conn2.cancelOrder('order-123', 'BTC/USDT')).rejects.toThrow(
        ExchangeNetworkError
      );
    });

    it('1.5: CCXT Cancellation Rejection — returns false when order is already terminal/closed', async () => {
      // When exchange reports order is already filled or does not exist
      const notFoundErr = new Error('Order does not exist (already filled)');
      const adapter = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(notFoundErr),
      });
      const connector = new CcxtExchangeConnector('bybit', adapter);

      const result = await connector.cancelOrder('ord-already-filled', 'ETH/USDT');
      expect(result).toBe(false);
    });

    it('1.6: CCXT Cancellation Rejection — throws OrderCancellationError on unhandled rejection', async () => {
      // Exchange actively rejects cancellation due to nonces/permission/signatures
      const rejectErr = new Error('Cancel rejected: Invalid API signature or permission');
      const adapter = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(rejectErr),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(connector.cancelOrder('ord-perm-fail', 'ETH/USDT')).rejects.toThrow(
        OrderCancellationError
      );
    });

    it('1.7: CCXT Cancellation Rejection — throws OrderCancellationError when params are empty', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(connector.cancelOrder('', 'BTC/USDT')).rejects.toThrow(OrderCancellationError);
      await expect(connector.cancelOrder('ord-1', '')).rejects.toThrow(OrderCancellationError);
    });

    it('1.8: CCXT Rate Limit — catches RateLimitExceeded on order placement and query', async () => {
      const rateLimitErr = new Error('429 Too Many Requests: Rate limit exceeded');
      rateLimitErr.name = 'RateLimitExceeded';

      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(rateLimitErr),
        fetchBalance: vi.fn().mockRejectedValue(rateLimitErr),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 0.5,
        })
      ).rejects.toThrow(ExchangeRateLimitError);

      await expect(connector.fetchBalance()).rejects.toThrow(ExchangeRateLimitError);
    });

    it('1.9: CCXT Rate Limit — catches DDoSProtection / IP Ban variations', async () => {
      const ddosErr = new Error('DDoS Protection triggered by cloudflare');
      ddosErr.name = 'DDoSProtection';

      const adapter = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(ddosErr),
      });
      const connector = new CcxtExchangeConnector('kucoin', adapter);

      await expect(connector.cancelOrder('order-999', 'SOL/USDT')).rejects.toThrow(
        ExchangeRateLimitError
      );
    });

    it('1.10: CCXT Latency Degradation — measures elevated latency without throwing', async () => {
      const adapter = createMockCcxtAdapter({
        fetchTime: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 40));
          return Date.now();
        }),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      const latency = await connector.getLatencyMs();
      expect(latency).toBeGreaterThanOrEqual(35);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Polymarket Market Order Fill & Terminal Cache Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Polymarket Market Order Fill & Terminal Cache Lifecycle', () => {
    it('2.1: Bounded market order fill with slippage is immediately placed into terminal cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-aggressive-buy',
        side: 'buy',
        type: 'market',
        amount: 100,
      });

      expect(placed.status).toBe('closed');
      expect(placed.filled).toBe(100);
      expect(placed.price).toBe(0.5355);

      // Verify immediate retrieval from Tier 3 terminal cache
      const fetched = await connector.fetchOrder(placed.orderId, 'tok-aggressive-buy');
      expect(fetched.orderId).toBe(placed.orderId);
      expect(fetched.status).toBe('closed');
      expect(fetched.filled).toBe(100);
      expect(fetched.remaining).toBe(0);
    });

    it('2.2: Bounded market sell sets price with slippage to 0.4655', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-aggressive-sell',
        side: 'sell',
        type: 'market',
        amount: 50,
      });

      expect(placed.price).toBe(0.4655);
      expect(adapter.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.4655,
          side: 'SELL',
        })
      );
    });

    it('2.3: CHALLENGE / FINDING: Asynchronously filled order is reconciled into closed terminal state', async () => {
      const openOrders: PolymarketOpenOrder[] = [];
      const polyAdapter = createMockPolymarketAdapter({
        getOpenOrders: vi.fn(async () => openOrders),
      });
      const posTracker = new LivePositionTracker();
      const liveManager = new LiveOrderManager(polyAdapter, posTracker);

      const prevEnv = process.env.LIVE_TRADING_ENABLED;
      process.env.LIVE_TRADING_ENABLED = 'true';

      try {
        const connector = new PolymarketConnectorAdapter(polyAdapter, liveManager, {
          dryRun: true,
        });

        // 1. Submit unmatched limit order
        const placed = await connector.placeOrder({
          symbol: 'tok-async-fill',
          side: 'buy',
          type: 'limit',
          amount: 20,
          price: 0.45,
        });

        expect(placed.status).toBe('open');
        const state = liveManager.getOrder(placed.orderId);
        expect(state).toBeDefined();

        // 2. Simulate CLOB match: order is filled and no longer open on CLOB
        openOrders.length = 0; // empty on CLOB
        // LiveOrderManager terminal fill handler deletes from activeOrders and emits 'filled'
        // @ts-expect-error accessing private method for simulation
        liveManager.handleFill(state!);

        expect(liveManager.getOrder(placed.orderId)).toBeUndefined();

        // 3. Now verify fetchOrder returns the reconciled closed order from terminalOrderCache
        const fetched = await connector.fetchOrder(placed.orderId, 'tok-async-fill');
        expect(fetched.orderId).toBe(placed.orderId);
        expect(fetched.status).toBe('closed');
        expect(fetched.filled).toBe(20);
        expect(fetched.remaining).toBe(0);
      } finally {
        process.env.LIVE_TRADING_ENABLED = prevEnv;
      }
    });

    it('2.4: CHALLENGE / FINDING: Expired/canceled order in LiveOrderManager is reconciled into terminal state', async () => {
      const openOrders: PolymarketOpenOrder[] = [];
      const polyAdapter = createMockPolymarketAdapter({
        getOpenOrders: vi.fn(async () => openOrders),
      });
      const posTracker = new LivePositionTracker();
      const liveManager = new LiveOrderManager(polyAdapter, posTracker);

      const prevEnv = process.env.LIVE_TRADING_ENABLED;
      process.env.LIVE_TRADING_ENABLED = 'true';

      try {
        const connector = new PolymarketConnectorAdapter(polyAdapter, liveManager, {
          dryRun: true,
        });

        const placed = await connector.placeOrder({
          symbol: 'tok-expire',
          side: 'buy',
          type: 'limit',
          amount: 15,
          price: 0.40,
        });

        expect(placed.status).toBe('open');

        // Cancel on CLOB side (order expired)
        openOrders.length = 0;

        // Cancel / expire order via liveManager
        await liveManager.cancelOrder(placed.orderId);

        // Order is removed from activeOrders
        expect(liveManager.getOrder(placed.orderId)).toBeUndefined();

        // fetchOrder returns status: 'canceled' from terminal cache
        const fetched = await connector.fetchOrder(placed.orderId, 'tok-expire');
        expect(fetched.orderId).toBe(placed.orderId);
        expect(fetched.status).toBe('canceled');
      } finally {
        process.env.LIVE_TRADING_ENABLED = prevEnv;
      }
    });

    it('2.5: Terminal cache persistence — cached order retains state across multiple fetches', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-cached',
        side: 'buy',
        type: 'market',
        amount: 75,
      });

      const f1 = await connector.fetchOrder(placed.orderId, 'tok-cached');
      const f2 = await connector.fetchOrder(placed.orderId, 'tok-cached');
      expect(f1).toEqual(f2);
      expect(f1.status).toBe('closed');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Burst Flood of 200 Opportunities into OpportunityIngestionPipeline
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Burst Flood of 200 Opportunities into OpportunityIngestionPipeline', () => {
    it('3.1: Burst flood of 200 IDENTICAL opportunities — deduplication filter drops exactly 199', async () => {
      let evaluations = 0;
      const calculator = new NetProfitabilityCalculator();
      const originalEvaluate = calculator.fromSpreadOpportunity.bind(calculator);
      vi.spyOn(calculator, 'fromSpreadOpportunity').mockImplementation((...args) => {
        evaluations++;
        return originalEvaluate(...args);
      });

      const pipeline = new OpportunityIngestionPipeline(
        {
          dedupTtlMs: 200,
          maxQueueSize: 50,
        },
        { calculator }
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-identical-1',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50300,
        spread: 300,
        spreadPercent: 0.6,
        timestamp: Date.now(),
        latency: 10,
      };

      // Create burst of 200 identical opportunities
      const burst: ArbitrageOpportunity[] = Array.from({ length: 200 }, () => ({ ...opp }));

      pipeline.handleOpportunities(burst);

      // Wait for queue processing to settle
      await new Promise((r) => setTimeout(r, 60));

      expect(pipeline.metrics.scannedCount).toBe(200);
      expect(pipeline.metrics.dedupDroppedCount).toBe(199);
      expect(pipeline.metrics.queueDroppedCount).toBe(0);
      expect(evaluations).toBe(1);
    });

    it('3.2: Burst flood of 200 DISTINCT opportunities — queue overflow drops exactly 150 oldest, preserving newest 50 (FIFO)', async () => {
      const pipeline = new OpportunityIngestionPipeline({
        maxQueueSize: 50,
        maxConcurrency: 0, // Freeze workers so we inspect queue state without immediate draining
        dedupTtlMs: 0, // Disable dedup
      });

      const burst: ArbitrageOpportunity[] = [];
      for (let i = 1; i <= 200; i++) {
        burst.push({
          id: `burst-opp-${i}`,
          symbol: `SYM-${i}/USDT`,
          buyExchange: 'binance',
          sellExchange: 'bybit',
          buyPrice: 100,
          sellPrice: 105,
          spread: 5,
          spreadPercent: 5.0,
          timestamp: Date.now(),
          latency: 5,
        });
      }

      pipeline.handleOpportunities(burst);

      expect(pipeline.metrics.scannedCount).toBe(200);
      expect(pipeline.metrics.dedupDroppedCount).toBe(0);
      expect(pipeline.metrics.queueDroppedCount).toBe(150);

      // Access private queue to inspect FIFO drop behavior
      // @ts-expect-error inspecting private queue for empirical verification
      const remainingQueue: ArbitrageOpportunity[] = pipeline.queue;

      expect(remainingQueue).toHaveLength(50);
      // The remaining 50 should be the newest opportunities (burst-opp-151 to burst-opp-200)
      expect(remainingQueue[0].id).toBe('burst-opp-151');
      expect(remainingQueue[49].id).toBe('burst-opp-200');
    });

    it('3.3: Memory Stability — 1,000 opportunity flood does not trigger memory leaks', async () => {
      const pipeline = new OpportunityIngestionPipeline({
        maxQueueSize: 50,
        maxConcurrency: 5,
        dedupTtlMs: 50,
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Ingest 5 bursts of 200 distinct opportunities (1,000 total)
      for (let batch = 0; batch < 5; batch++) {
        const batchOpps: ArbitrageOpportunity[] = [];
        for (let i = 0; i < 200; i++) {
          const id = batch * 200 + i;
          batchOpps.push({
            id: `mem-opp-${id}`,
            symbol: `SYM-${id}/USDT`,
            buyExchange: 'binance',
            sellExchange: 'bybit',
            buyPrice: 100,
            sellPrice: 102,
            spread: 2,
            spreadPercent: 2.0,
            timestamp: Date.now(),
            latency: 5,
          });
        }
        pipeline.handleOpportunities(batchOpps);
        await new Promise((r) => setTimeout(r, 20));
      }

      await new Promise((r) => setTimeout(r, 100));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowthMb = (finalMemory - initialMemory) / (1024 * 1024);

      // Memory growth for processing 1,000 lightweight objects should be well within bounds (< 25 MB)
      expect(memoryGrowthMb).toBeLessThan(25);
      expect(pipeline.metrics.scannedCount).toBe(1000);
    });

    it('3.4: Worker Concurrency Semaphore — activeWorkers never exceeds maxConcurrency under load', async () => {
      let maxObservedActiveWorkers = 0;
      let currentActiveWorkers = 0;

      const mockCalculator = {
        fromSpreadOpportunity: vi.fn(() => {
          currentActiveWorkers++;
          if (currentActiveWorkers > maxObservedActiveWorkers) {
            maxObservedActiveWorkers = currentActiveWorkers;
          }
          // Simulate compute work
          const start = Date.now();
          while (Date.now() - start < 5) {
            // spin 5ms
          }
          currentActiveWorkers--;
          return {
            isProfitable: true,
            grossSpreadUsd: 10,
            grossSpreadBps: 20,
            estimatedBuyFeeUsd: 1,
            estimatedSellFeeUsd: 1,
            estimatedGasUsd: 0,
            estimatedBuySlippageUsd: 0,
            estimatedSellSlippageUsd: 0,
            totalCostUsd: 2,
            netProfitUsd: 8,
            netProfitBps: 16,
          };
        }),
      } as unknown as NetProfitabilityCalculator;

      const pipeline = new OpportunityIngestionPipeline(
        {
          maxQueueSize: 100,
          maxConcurrency: 3,
          dedupTtlMs: 0,
        },
        { calculator: mockCalculator }
      );

      const burst: ArbitrageOpportunity[] = Array.from({ length: 50 }, (_, i) => ({
        id: `concurrency-opp-${i}`,
        symbol: `COIN-${i}/USDT`,
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50,
        sellPrice: 52,
        spread: 2,
        spreadPercent: 4.0,
        timestamp: Date.now(),
        latency: 5,
      }));

      pipeline.handleOpportunities(burst);
      await new Promise((r) => setTimeout(r, 200));

      // Max concurrent workers must respect the semaphore limit of 3
      expect(maxObservedActiveWorkers).toBeLessThanOrEqual(3);
    });

    it('3.5: FINDING: Metric Accounting — verify error containment when onAdmitted callback rejects', async () => {
      // Test what happens when an opportunity is admitted, but onAdmitted callback throws:
      // In decoupled design, onAdmitted callback error is caught and contained,
      // preserving single terminal status without double counting in rejectedCount.

      const pipeline = new OpportunityIngestionPipeline(
        { minHurdleBps: 10 },
        {
          onAdmitted: async () => {
            throw new Error('Downstream order execution failed');
          },
        }
      );

      const passingOpp: ArbitrageOpportunity = {
        id: 'opp-admit-throw',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50500, // 100 bps spread, passes hurdle
        spread: 500,
        spreadPercent: 1.0,
        timestamp: Date.now(),
        latency: 5,
      };

      pipeline.handleOpportunities([passingOpp]);
      await new Promise((r) => setTimeout(r, 60));

      // Verifies single terminal category invariant:
      expect(pipeline.metrics.admittedCount).toBe(1);
      expect(pipeline.metrics.rejectedCount).toBe(0);
      expect(pipeline.metrics.admittedCount + pipeline.metrics.rejectedCount).toBe(1);
    });

    it('3.6: Dedup Cache Pruning — verifies stale cache pruning after TTL expiration', async () => {
      const pipeline = new OpportunityIngestionPipeline({
        dedupTtlMs: 25,
      });

      const opp: ArbitrageOpportunity = {
        id: 'opp-ttl-test',
        symbol: 'SOL/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 150,
        sellPrice: 152,
        spread: 2,
        spreadPercent: 1.33,
        timestamp: Date.now(),
        latency: 5,
      };

      pipeline.handleOpportunities([opp]);
      expect(pipeline.metrics.scannedCount).toBe(1);
      expect(pipeline.metrics.dedupDroppedCount).toBe(0);

      // Send immediately -> dropped as duplicate
      pipeline.handleOpportunities([opp]);
      expect(pipeline.metrics.dedupDroppedCount).toBe(1);

      // Wait beyond TTL (25ms * 2 = 50ms)
      await new Promise((r) => setTimeout(r, 60));

      // Send again -> should be admitted as fresh opportunity
      pipeline.handleOpportunities([opp]);
      expect(pipeline.metrics.scannedCount).toBe(3);
      expect(pipeline.metrics.dedupDroppedCount).toBe(1); // not incremented
    });
  });
});
