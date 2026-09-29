/**
 * Comprehensive Vitest Suite for Milestone 1:
 * Multi-Exchange Connectors & Net Profitability Calculator
 *
 * Covers:
 * 1. CcxtExchangeConnector (Binance, Bybit, KuCoin)
 * 2. PolymarketConnectorAdapter (EIP-712, 3-tier cascade, balance, latency)
 * 3. Dynamic Fee Calculations (CEX 10 bps, Polymarket dynamic curve, maker rebates)
 * 4. Gas Cost Modeling (Off-chain $0, Polygon on-chain CTF formula)
 * 5. Slippage Modeling (VWAP depth walking, insufficient liquidity, parametric fallback)
 * 6. Net Profitability Synthesis & Hurdle Gate (>= 10 bps, rejection taxonomy)
 * 7. SpreadDetector Hook Integration & OpportunityIngestionPipeline / ArbitrageEngine
 */

import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExchangeOrderParamsSchema,
  InsufficientBalanceError,
  ExchangeRateLimitError,
  ExchangeNetworkError,
  OrderNotFoundError,
  OrderPlacementError,
  ExchangeConnectorError,
} from '../../../src/desk/arbitrage/connectors/types';
import type {
  CcxtExchangeAdapter,
  CcxtRawOrder,
  CcxtRawBalance,
} from '../../../src/desk/markets/cex/ccxt-exchange-connector';
import {
  CcxtExchangeConnector,
  createCcxtExchange,
} from '../../../src/desk/markets/cex/ccxt-exchange-connector';
import {
  PolymarketConnectorAdapter,
  DEFAULT_TERMINAL_CACHE_CAPACITY,
  DEFAULT_TERMINAL_CACHE_TTL_MS,
} from '../../../src/desk/execution/polymarket-connector-adapter';
import type {
  PolymarketAdapter,
  PolymarketOrderResponse,
  PolymarketOpenOrder,
} from '../../../src/desk/execution/polymarket-adapter';
import type { LiveOrderManager } from '../../../src/desk/execution/live-order-manager';
import type { OrderState } from '../../../src/desk/execution/live-order-manager-types';
import type { PolymarketOrder } from '../../../src/desk/execution/polymarket-signer';
import {
  NetProfitabilityCalculator,
} from '../../../src/desk/arbitrage/net-profitability-calculator';
import {
  OpportunityIngestionPipeline,
  ArbitrageEngine,
} from '../../../src/desk/arbitrage/opportunity-ingestion-pipeline';
import type { ArbitrageOpportunity } from '../../../src/desk/arbitrage/spread-detector-types';
import { SpreadDetector } from '../../../src/desk/arbitrage/spread-detector';

// ── Mock Factories ──────────────────────────────────────────────────────────

function createMockCcxtAdapter(overrides: Partial<CcxtExchangeAdapter> = {}): CcxtExchangeAdapter {
  const orders = new Map<string, CcxtRawOrder>();
  let orderSeq = 100;

  return {
    createOrder: vi.fn(async (symbol, type, side, amount, price, params) => {
      orderSeq++;
      const id = `mock-order-${orderSeq}`;
      const effectivePrice = price ?? 50000;
      const isInstant = type === 'market';
      const order: CcxtRawOrder = {
        id,
        clientOrderId: params?.clientOrderId as string | undefined,
        symbol,
        type,
        side,
        amount,
        price: effectivePrice,
        average: effectivePrice,
        filled: isInstant ? amount : 0,
        remaining: isInstant ? 0 : amount,
        status: isInstant ? 'closed' : 'open',
        timestamp: Date.now(),
        fee: { cost: amount * effectivePrice * 0.001, currency: 'USDT' },
      };
      orders.set(id, order);
      return order;
    }),
    cancelOrder: vi.fn(async (id: string) => {
      const ord = orders.get(id);
      if (!ord) throw new Error('Order not found');
      ord.status = 'canceled';
      return { id, status: 'canceled' };
    }),
    fetchOrder: vi.fn(async (id: string) => {
      const ord = orders.get(id);
      if (!ord) throw new Error('Order not found');
      return ord;
    }),
    fetchBalance: vi.fn(async () => {
      const balance: CcxtRawBalance = {
        free: { USDT: 10000, BTC: 1.5, ETH: 0 },
        used: { USDT: 500, BTC: 0.1, ETH: 0 },
        total: { USDT: 10500, BTC: 1.6, ETH: 0 },
      };
      return balance;
    }),
    fetchTime: vi.fn(async () => Date.now()),
    fetchStatus: vi.fn(async () => ({ status: 'ok' })),
    ...overrides,
  };
}

function createMockPolymarketAdapter(overrides: Partial<PolymarketAdapter> = {}): PolymarketAdapter {
  const openOrders: PolymarketOpenOrder[] = [];
  let seq = 500;

  return {
    placeOrder: vi.fn(async (order: PolymarketOrder): Promise<PolymarketOrderResponse> => {
      seq++;
      const orderID = `0xpoly-${seq}`;
      const isMatched = order.price >= 0.90; // aggressive marketable orders match
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
      market: 'mock-market',
      asset_id: tokenId,
      bids: [{ price: '0.48', size: '1000' }],
      asks: [{ price: '0.52', size: '1000' }],
      hash: '0xmockhash',
      timestamp: String(Date.now()),
    })),
    getMarketInfo: vi.fn(async (conditionId: string) => ({
      condition_id: conditionId,
      question_id: 'q-1',
      question: 'Will BTC exceed 100k?',
      description: 'Crypto prediction market for BTC',
      market_slug: 'btc-100k',
      end_date_iso: '2026-12-31',
      tokens: [
        { token_id: 'tok-yes', outcome: 'Yes', price: 0.52 },
        { token_id: 'tok-no', outcome: 'No', price: 0.48 },
      ],
      active: true,
      closed: false,
      archived: false,
      minimum_order_size: '5',
      minimum_tick_size: '0.01',
      category: 'crypto',
    })),
    ...overrides,
  } as unknown as PolymarketAdapter;
}

function createMockLiveOrderManager(adapter: PolymarketAdapter): LiveOrderManager {
  const activeOrders = new Map<string, OrderState>();
  const emitter = new EventEmitter();

  const manager = Object.assign(emitter, {
    adapter,
    activeOrders,
    stopped: false,
    submitAndTrack: vi.fn(async (order: PolymarketOrder): Promise<PolymarketOrderResponse> => {
      const resp = await adapter.placeOrder(order);
      const isMatched = resp.status === 'matched';
      const state: OrderState = {
        orderId: resp.orderID,
        tokenId: order.tokenId,
        side: order.side,
        size: order.size,
        price: order.price,
        status: isMatched ? 'matched' : 'pending',
        submittedAt: Date.now(),
        lastPollAt: Date.now(),
        pollAttempts: 0,
      };
      if (!isMatched) {
        activeOrders.set(resp.orderID, state);
      }
      return resp;
    }),
    cancelOrder: vi.fn(async (orderId: string): Promise<void> => {
      await adapter.cancelOrder(orderId);
      const st = activeOrders.get(orderId);
      if (st) st.status = 'canceled';
      activeOrders.delete(orderId);
      emitter.emit('canceled', orderId);
    }),
    getOrder: vi.fn((orderId: string) => activeOrders.get(orderId)),
    getActiveOrders: vi.fn(() => Array.from(activeOrders.values())),
    positionTracker: {
      getPositions: vi.fn(() => [
        { tokenId: 'tok-yes', side: 'BUY', size: 250, entryPrice: 0.50, currentPrice: 0.52, unrealizedPnl: 5, openedAt: Date.now(), lastPriceUpdate: Date.now() },
      ]),
    },
  });

  return manager as unknown as LiveOrderManager;
}

// ── Test Suites ─────────────────────────────────────────────────────────────

describe('M1: Exchange Connectors & Net Profitability Suite', () => {
  // ── 1. CcxtExchangeConnector (Binance, Bybit, KuCoin) ──────────────────────
  describe('1. CcxtExchangeConnector (Binance, Bybit, KuCoin)', () => {
    it('1.1: instantiates Binance, Bybit, KuCoin connectors with mock adapter', () => {
      const adapter = createMockCcxtAdapter();
      const binance = new CcxtExchangeConnector('binance', adapter);
      const bybit = new CcxtExchangeConnector('bybit', adapter);
      const kucoin = new CcxtExchangeConnector('kucoin', adapter);

      expect(binance.exchangeId).toBe('binance');
      expect(bybit.exchangeId).toBe('bybit');
      expect(kucoin.exchangeId).toBe('kucoin');
    });

    it('1.2: places limit order with clientOrderId and normalizes output', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      const result = await connector.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.25,
        price: 52000,
        clientOrderId: 'cid-custom-42',
      });

      expect(result.orderId).toContain('mock-order-');
      expect(result.exchange).toBe('binance');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.price).toBe(52000);
      expect(result.amount).toBe(0.25);
      expect(result.clientOrderId).toBe('cid-custom-42');
      expect(result.status).toBe('open');
      expect(adapter.createOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'limit',
        'buy',
        0.25,
        52000,
        expect.objectContaining({ clientOrderId: 'cid-custom-42' })
      );
    });

    it('1.3: injects category: spot when placing order on Bybit', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('bybit', adapter);

      await connector.placeOrder({
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        amount: 1.5,
      });

      expect(adapter.createOrder).toHaveBeenCalledWith(
        'ETH/USDT',
        'market',
        'sell',
        1.5,
        undefined,
        expect.objectContaining({ category: 'spot' })
      );
    });

    it('1.4: validates KuCoin credentials during construction without injected adapter', () => {
      expect(() => {
        new CcxtExchangeConnector('kucoin', undefined, {
          apiKey: 'test-key',
          secret: 'test-secret',
          // password omitted
        });
      }).toThrow('KuCoin requires an API passphrase');
    });

    it('1.5: rejects limit order with missing price via Zod schema refinement', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      const invalidParams = {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
      };

      await expect(
        // @ts-expect-error Testing invalid schema input
        connector.placeOrder(invalidParams)
      ).rejects.toThrow('Price is required');
    });

    it('1.6: rejects non-positive amount via Zod validation', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: -0.5,
        })
      ).rejects.toThrow('Amount must be strictly positive');

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 0,
        })
      ).rejects.toThrow('Amount must be strictly positive');
    });

    it('1.7: cancels open order successfully and returns true', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      const order = await connector.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
      });

      const canceled = await connector.cancelOrder(order.orderId, 'BTC/USDT');
      expect(canceled).toBe(true);
      expect(adapter.cancelOrder).toHaveBeenCalledWith(order.orderId, 'BTC/USDT', expect.any(Object));
    });

    it('1.8: returns false gracefully when cancelOrder finds order already closed or not found', async () => {
      const adapter = createMockCcxtAdapter({
        cancelOrder: vi.fn().mockRejectedValue(new Error('Order not found')),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      const canceled = await connector.cancelOrder('non-existent-order', 'BTC/USDT');
      expect(canceled).toBe(false);
    });

    it('1.9: maps CCXT order statuses to unified status enum', async () => {
      const mockOrder: CcxtRawOrder = {
        id: 'ord-status-1',
        symbol: 'BTC/USDT',
        type: 'limit',
        side: 'buy',
        amount: 1.0,
        price: 50000,
        filled: 1.0,
        remaining: 0,
        status: 'closed',
        timestamp: 1700000000000,
      };

      const adapter = createMockCcxtAdapter({
        fetchOrder: vi.fn().mockResolvedValue(mockOrder),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      const res = await connector.fetchOrder('ord-status-1', 'BTC/USDT');
      expect(res.status).toBe('closed');
      expect(res.filled).toBe(1.0);
      expect(res.remaining).toBe(0);
    });

    it('1.10: fetches balance, filters zero balances, and returns normalized records', async () => {
      const adapter = createMockCcxtAdapter();
      const connector = new CcxtExchangeConnector('binance', adapter);

      const balance = await connector.fetchBalance();
      expect(balance.USDT).toBeDefined();
      expect(balance.USDT.free).toBe(10000);
      expect(balance.USDT.total).toBe(10500);
      expect(balance.BTC).toBeDefined();
      expect(balance.BTC.free).toBe(1.5);
      // Zero balance for ETH should be filtered out
      expect(balance.ETH).toBeUndefined();
    });

    it('1.11: measures REST latency in milliseconds and returns non-negative number', async () => {
      const adapter = createMockCcxtAdapter({
        fetchTime: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return Date.now();
        }),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      const latencyMs = await connector.getLatencyMs();
      expect(latencyMs).toBeGreaterThanOrEqual(5);
    });

    it('1.12: translates InsufficientFunds error into InsufficientBalanceError', async () => {
      const err = new Error('account has insufficient balance');
      err.name = 'InsufficientFunds';
      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(err),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 100,
        })
      ).rejects.toThrow(InsufficientBalanceError);
    });

    it('1.13: translates RateLimitExceeded into ExchangeRateLimitError', async () => {
      const err = new Error('Too many requests; IP banned');
      err.name = 'RateLimitExceeded';
      const adapter = createMockCcxtAdapter({
        createOrder: vi.fn().mockRejectedValue(err),
      });
      const connector = new CcxtExchangeConnector('bybit', adapter);

      await expect(
        connector.placeOrder({
          symbol: 'BTC/USDT',
          side: 'buy',
          type: 'market',
          amount: 0.1,
        })
      ).rejects.toThrow(ExchangeRateLimitError);
    });

    it('1.14: translates NetworkError into ExchangeNetworkError', async () => {
      const err = new Error('connect ECONNREFUSED');
      err.name = 'NetworkError';
      const adapter = createMockCcxtAdapter({
        fetchBalance: vi.fn().mockRejectedValue(err),
      });
      const connector = new CcxtExchangeConnector('kucoin', adapter);

      await expect(connector.fetchBalance()).rejects.toThrow(ExchangeNetworkError);
    });

    it('1.15: translates OrderNotFound into OrderNotFoundError', async () => {
      const err = new Error('Order not found on exchange');
      err.name = 'OrderNotFound';
      const adapter = createMockCcxtAdapter({
        fetchOrder: vi.fn().mockRejectedValue(err),
      });
      const connector = new CcxtExchangeConnector('binance', adapter);

      await expect(connector.fetchOrder('missing-123', 'BTC/USDT')).rejects.toThrow(OrderNotFoundError);
    });

    it('1.16: translates Node.js socket, DNS, and HTTP client network errors into ExchangeNetworkError', async () => {
      const socketErrors = [
        new Error('connect ETIMEDOUT 104.18.25.14:443'),
        new Error('read ECONNRESET'),
        new Error('socket hang up'),
        new Error('getaddrinfo ENOTFOUND api.binance.com'),
        new Error('getaddrinfo EAI_AGAIN api.binance.com'),
        new Error('request timed out after 10000ms'),
        new Error('connect ECONNREFUSED 127.0.0.1:443'),
        new Error('connection closed by peer'),
        Object.assign(new Error('Connection failure'), { code: 'ETIMEDOUT' }),
        Object.assign(new Error('Connection abort'), { code: 'ECONNABORTED' }),
        Object.assign(new Error('Unreachable host'), { code: 'EHOSTUNREACH' }),
        Object.assign(new Error('Fetch failed'), { cause: { code: 'ECONNRESET' } }),
      ];

      for (const err of socketErrors) {
        const adapter = createMockCcxtAdapter({
          createOrder: vi.fn().mockRejectedValue(err),
          cancelOrder: vi.fn().mockRejectedValue(err),
          fetchOrder: vi.fn().mockRejectedValue(err),
          fetchBalance: vi.fn().mockRejectedValue(err),
        });
        const connector = new CcxtExchangeConnector('binance', adapter);

        await expect(
          connector.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', amount: 0.1 })
        ).rejects.toThrow(ExchangeNetworkError);

        await expect(
          connector.cancelOrder('ord-1', 'BTC/USDT')
        ).rejects.toThrow(ExchangeNetworkError);

        await expect(
          connector.fetchOrder('ord-1', 'BTC/USDT')
        ).rejects.toThrow(ExchangeNetworkError);

        await expect(
          connector.fetchBalance()
        ).rejects.toThrow(ExchangeNetworkError);
      }
    });
  });

  // ── 2. PolymarketConnectorAdapter ─────────────────────────────────────────
  describe('2. PolymarketConnectorAdapter', () => {
    it('2.1: initializes with wrapped adapter and reports exchangeId polymarket', () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter);
      expect(connector.exchangeId).toBe('polymarket');
    });

    it('2.2: places limit order by constructing EIP-712 order struct and delegating to adapter', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      const res = await connector.placeOrder({
        symbol: 'tok-btc-100k-yes',
        side: 'buy',
        type: 'limit',
        amount: 100,
        price: 0.45,
        clientOrderId: 'poly-cid-1',
      });

      expect(res.orderId).toContain('0xpoly-');
      expect(res.exchange).toBe('polymarket');
      expect(res.price).toBe(0.45);
      expect(res.amount).toBe(100);
      expect(res.status).toBe('open');
      expect(adapter.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'tok-btc-100k-yes',
          price: 0.45,
          size: 100,
          side: 'BUY',
        })
      );
    });

    it('2.3: emulates market buy by setting aggressive limit price 0.99', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      const res = await connector.placeOrder({
        symbol: 'tok-btc-yes',
        side: 'buy',
        type: 'market',
        amount: 50,
      });

      expect(res.price).toBe(0.99);
      expect(adapter.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.99,
          side: 'BUY',
        })
      );
      // Because mock adapter matches orders with price >= 0.90
      expect(res.status).toBe('closed');
      expect(res.filled).toBe(50);
    });

    it('2.4: emulates market sell by setting aggressive limit price 0.01', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      await connector.placeOrder({
        symbol: 'tok-btc-yes',
        side: 'sell',
        type: 'market',
        amount: 25,
      });

      expect(adapter.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          price: 0.01,
          side: 'SELL',
        })
      );
    });

    it('2.5: places order and tracks fill lifecycle via injected LiveOrderManager', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const res = await connector.placeOrder({
        symbol: 'tok-btc-yes',
        side: 'buy',
        type: 'limit',
        amount: 10,
        price: 0.40,
      });

      expect(manager.submitAndTrack).toHaveBeenCalled();
      expect(res.status).toBe('open');
    });

    it('2.6: cancels order via LiveOrderManager or adapter and updates cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const order = await connector.placeOrder({
        symbol: 'tok-yes',
        side: 'buy',
        type: 'limit',
        amount: 10,
        price: 0.35,
      });

      const canceled = await connector.cancelOrder(order.orderId, 'tok-yes');
      expect(canceled).toBe(true);
      expect(manager.cancelOrder).toHaveBeenCalledWith(order.orderId);
    });

    it('2.7: fetchOrder Tier 1: retrieves from LiveOrderManager active tracking', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const order = await connector.placeOrder({
        symbol: 'tok-yes',
        side: 'buy',
        type: 'limit',
        amount: 10,
        price: 0.40,
      });

      const fetched = await connector.fetchOrder(order.orderId, 'tok-yes');
      expect(fetched.orderId).toBe(order.orderId);
      expect(fetched.status).toBe('open');
    });

    it('2.8: fetchOrder Tier 2 & Tier 3: falls back to adapter open orders and terminal cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      // Place aggressive buy -> matches immediately -> goes into terminal cache
      const order = await connector.placeOrder({
        symbol: 'tok-yes',
        side: 'buy',
        type: 'market',
        amount: 15,
      });

      const fetched = await connector.fetchOrder(order.orderId, 'tok-yes');
      expect(fetched.orderId).toBe(order.orderId);
      expect(fetched.status).toBe('closed');
      expect(fetched.filled).toBe(15);
    });

    it('2.9: fetchOrder throws OrderNotFoundError when order not found in any tier', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: true });

      await expect(connector.fetchOrder('non-existent-order-id', 'tok-yes')).rejects.toThrow(
        OrderNotFoundError
      );
    });

    it('2.10: fetchBalance returns balance from custom balanceProvider when supplied', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, {
        balanceProvider: async () => ({
          USDC: { free: 5000, used: 200, total: 5200 },
          'tok-custom': { free: 100, used: 0, total: 100 },
        }),
      });

      const balance = await connector.fetchBalance();
      expect(balance.USDC.free).toBe(5000);
      expect(balance['tok-custom'].total).toBe(100);
    });

    it('2.11: fetchBalance calculates default USDC balance and position tracker inventory', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, {
        defaultUsdcBalance: 8000,
        dryRun: true,
      });

      // Place open buy order: size 100 @ 0.40 = $40 used USDC
      await connector.placeOrder({
        symbol: 'tok-yes',
        side: 'buy',
        type: 'limit',
        amount: 100,
        price: 0.40,
      });

      const balance = await connector.fetchBalance();
      expect(balance.USDC.total).toBe(8000);
      expect(balance.USDC.used).toBe(40);
      expect(balance.USDC.free).toBe(7960);
      expect(balance['tok-yes'].total).toBe(250); // from mock position tracker
    });

    it('2.12: getLatencyMs measures round-trip time to getOrderBook probe', async () => {
      const adapter = createMockPolymarketAdapter({
        getOrderBook: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return {
            market: 'm',
            asset_id: 'tok',
            bids: [],
            asks: [],
            hash: 'h',
            timestamp: '0',
          };
        }),
      });
      const connector = new PolymarketConnectorAdapter(adapter);

      const latency = await connector.getLatencyMs();
      expect(latency).toBeGreaterThanOrEqual(5);
    });

    it('2.13: rejects order placement if dryRun is false and LIVE_TRADING_ENABLED !== "true"', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, { dryRun: false });

      const prevEnv = process.env.LIVE_TRADING_ENABLED;
      process.env.LIVE_TRADING_ENABLED = 'false';

      try {
        await expect(
          connector.placeOrder({
            symbol: 'tok-live',
            side: 'buy',
            type: 'limit',
            amount: 10,
            price: 0.50,
          })
        ).rejects.toThrow();
      } finally {
        process.env.LIVE_TRADING_ENABLED = prevEnv;
      }
    });

    it('2.14: reconciles asynchronous "filled" event from LiveOrderManager into closed terminal cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-async-1',
        side: 'buy',
        type: 'limit',
        amount: 25,
        price: 0.45,
        clientOrderId: 'cid-async-1',
      });
      expect(placed.status).toBe('open');

      // LiveOrderManager emits 'filled'
      const state: OrderState = {
        orderId: placed.orderId,
        tokenId: 'tok-async-1',
        side: 'BUY',
        size: 25,
        price: 0.45,
        status: 'matched',
        submittedAt: Date.now(),
        lastPollAt: Date.now(),
        pollAttempts: 1,
      };
      (manager as unknown as EventEmitter).emit('filled', state);

      const fetched = await connector.fetchOrder(placed.orderId, 'tok-async-1');
      expect(fetched.orderId).toBe(placed.orderId);
      expect(fetched.clientOrderId).toBe('cid-async-1');
      expect(fetched.status).toBe('closed');
      expect(fetched.filled).toBe(25);
      expect(fetched.remaining).toBe(0);

      connector.dispose();
    });

    it('2.15: reconciles asynchronous "expired" event from LiveOrderManager into expired terminal cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-async-exp',
        side: 'buy',
        type: 'limit',
        amount: 15,
        price: 0.40,
        clientOrderId: 'cid-async-exp',
      });

      (manager as unknown as EventEmitter).emit('expired', placed.orderId);

      const fetched = await connector.fetchOrder(placed.orderId, 'tok-async-exp');
      expect(fetched.orderId).toBe(placed.orderId);
      expect(fetched.clientOrderId).toBe('cid-async-exp');
      expect(fetched.status).toBe('expired');
      expect(fetched.remaining).toBe(15);

      connector.dispose();
    });

    it('2.16: reconciles asynchronous "canceled" event from LiveOrderManager into canceled terminal cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const placed = await connector.placeOrder({
        symbol: 'tok-async-cancel',
        side: 'sell',
        type: 'limit',
        amount: 30,
        price: 0.55,
        clientOrderId: 'cid-async-cancel',
      });

      (manager as unknown as EventEmitter).emit('canceled', placed.orderId);

      const fetched = await connector.fetchOrder(placed.orderId, 'tok-async-cancel');
      expect(fetched.orderId).toBe(placed.orderId);
      expect(fetched.clientOrderId).toBe('cid-async-cancel');
      expect(fetched.status).toBe('canceled');
      expect(fetched.remaining).toBe(30);

      connector.dispose();
    });

    it('2.17: dispose() unhooks listeners and empties terminal order cache', async () => {
      const adapter = createMockPolymarketAdapter();
      const manager = createMockLiveOrderManager(adapter);
      const connector = new PolymarketConnectorAdapter(adapter, manager, { dryRun: true });

      const emitter = manager as unknown as EventEmitter;
      expect(emitter.listenerCount('filled')).toBe(1);
      expect(emitter.listenerCount('expired')).toBe(1);
      expect(emitter.listenerCount('canceled')).toBe(1);

      // Place a matched order so terminal cache is populated
      const matched = await connector.placeOrder({
        symbol: 'tok-disp',
        side: 'buy',
        type: 'market',
        amount: 10,
      });
      expect(connector.getTerminalCacheSize()).toBeGreaterThan(0);

      connector.dispose();

      expect(emitter.listenerCount('filled')).toBe(0);
      expect(emitter.listenerCount('expired')).toBe(0);
      expect(emitter.listenerCount('canceled')).toBe(0);
      expect(connector.getTerminalCacheSize()).toBe(0);

      // Subsequent fetchOrder throws OrderNotFoundError because cache is cleared
      await expect(connector.fetchOrder(matched.orderId, 'tok-disp')).rejects.toThrow(
        OrderNotFoundError
      );
    });

    it('2.18: enforces bounded terminal cache capacity with FIFO/LRU eviction', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, {
        dryRun: true,
        terminalCacheCapacity: 3,
      });

      // Place 4 matched market orders into cache with capacity 3
      const o1 = await connector.placeOrder({ symbol: 'tok-1', side: 'buy', type: 'market', amount: 1 });
      const o2 = await connector.placeOrder({ symbol: 'tok-2', side: 'buy', type: 'market', amount: 2 });
      const o3 = await connector.placeOrder({ symbol: 'tok-3', side: 'buy', type: 'market', amount: 3 });

      expect(connector.getTerminalCacheSize()).toBe(3);

      const o4 = await connector.placeOrder({ symbol: 'tok-4', side: 'buy', type: 'market', amount: 4 });
      expect(connector.getTerminalCacheSize()).toBe(3);

      // o1 (oldest) should have been evicted
      await expect(connector.fetchOrder(o1.orderId, 'tok-1')).rejects.toThrow(OrderNotFoundError);
      // o2, o3, o4 should still be cached
      const f2 = await connector.fetchOrder(o2.orderId, 'tok-2');
      expect(f2.orderId).toBe(o2.orderId);
      const f4 = await connector.fetchOrder(o4.orderId, 'tok-4');
      expect(f4.orderId).toBe(o4.orderId);

      connector.dispose();
    });

    it('2.19: enforces TTL expiration on terminal cache entries', async () => {
      const adapter = createMockPolymarketAdapter();
      const connector = new PolymarketConnectorAdapter(adapter, undefined, {
        dryRun: true,
        terminalCacheTtlMs: 30, // 30ms TTL
      });

      const order = await connector.placeOrder({
        symbol: 'tok-ttl',
        side: 'buy',
        type: 'market',
        amount: 5,
      });

      // Immediately present in cache
      const f1 = await connector.fetchOrder(order.orderId, 'tok-ttl');
      expect(f1.orderId).toBe(order.orderId);

      // Wait 40ms to exceed TTL
      await new Promise((r) => setTimeout(r, 40));

      // fetchOrder should passively evict expired entry and throw OrderNotFoundError
      await expect(connector.fetchOrder(order.orderId, 'tok-ttl')).rejects.toThrow(
        OrderNotFoundError
      );
      expect(connector.getTerminalCacheSize()).toBe(0);

      connector.dispose();
    });

    it('2.20: duck-typed mock resilience — operates without throwing when manager lacks .on / .off', async () => {
      const adapter = createMockPolymarketAdapter();
      const duckMock = {
        adapter,
        activeOrders: new Map<string, OrderState>(),
        stopped: false,
        submitAndTrack: vi.fn(),
        cancelOrder: vi.fn(),
        getOrder: vi.fn(),
        getActiveOrders: vi.fn(() => []),
      } as unknown as LiveOrderManager;

      // Construction should not throw
      const connector = new PolymarketConnectorAdapter(adapter, duckMock, { dryRun: true });
      expect(connector.exchangeId).toBe('polymarket');

      // dispose should not throw
      expect(() => connector.dispose()).not.toThrow();
    });
  });

  // ── 3. Dynamic Fee Calculations ───────────────────────────────────────────
  describe('3. Dynamic Fee Calculations', () => {
    let calculator: NetProfitabilityCalculator;

    beforeEach(() => {
      calculator = new NetProfitabilityCalculator({ defaultHurdleBps: 10 });
    });

    it('3.1: calculates 10 bps taker fee on CEX venues (Binance vs Bybit)', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: 0.2, // $10,000 buy notional, $10,100 sell notional
      });

      // Buy fee: 10,000 * 0.0010 = $10.00
      expect(analysis.estimatedBuyFeeUsd).toBeCloseTo(10.0, 2);
      // Sell fee: 10,100 * 0.0010 = $10.10
      expect(analysis.estimatedSellFeeUsd).toBeCloseTo(10.1, 2);
      expect(analysis.totalCostUsd).toBeGreaterThanOrEqual(20.1);
    });

    it('3.2: evaluates Polymarket dynamic taker fee curve at probability p = 0.50', () => {
      // At p = 0.50, distance = 0, rate = minTakerFee = 0.0035 (35 bps)
      const res = calculator.calculatePolymarketFee('crypto', 0.50, 1000);
      expect(res.rate).toBeCloseTo(0.0035, 4);
      expect(res.feeUsd).toBeCloseTo(3.50, 2);
    });

    it('3.3: evaluates Polymarket dynamic taker fee curve at extreme probability p = 0.95', () => {
      // At p = 0.95, distance = 0.45, ratio = 0.9, rate = 0.0035 + (0.018 - 0.0035)*0.9 = 0.01655
      const res = calculator.calculatePolymarketFee('crypto', 0.95, 1000);
      expect(res.rate).toBeCloseTo(0.01655, 4);
      expect(res.feeUsd).toBeCloseTo(16.55, 2);
    });

    it('3.4: returns 0 fee for exempt Polymarket categories (geopolitics, world_events)', () => {
      const res1 = calculator.calculatePolymarketFee('geopolitics', 0.90, 1000);
      expect(res1.rate).toBe(0);
      expect(res1.feeUsd).toBe(0);

      const res2 = calculator.calculatePolymarketFee('world_events', 0.10, 1000);
      expect(res2.rate).toBe(0);
      expect(res2.feeUsd).toBe(0);
    });

    it('3.5: credits maker rebate when orderType is maker on Polymarket', () => {
      const analysis = calculator.evaluate({
        buyLeg: {
          venue: 'polymarket',
          symbol: 'tok-finance',
          price: 0.50,
          side: 'buy',
          orderType: 'maker',
          polymarketCategory: 'finance',
        },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 0.55, side: 'sell' },
        tradeAmount: 2000, // $1,000 notional
      });

      // Finance maker rebate is 50% of taker fee (0.0020 * 0.50 = -0.0010 rebate)
      expect(analysis.estimatedBuyFeeUsd).toBeLessThan(0);
    });
  });

  // ── 4. Gas Cost Modeling ──────────────────────────────────────────────────
  describe('4. Gas Cost Modeling', () => {
    let calculator: NetProfitabilityCalculator;

    beforeEach(() => {
      calculator = new NetProfitabilityCalculator({
        maticPriceUsd: 0.50,
        gasConfig: {
          polygonGasUnits: 150_000,
          polygonGasPriceGwei: 50,
          maticPriceUsd: 0.50,
        },
      });
    });

    it('4.1: returns exactly $0.00 gas for CEX and off-chain CLOB venues', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'polymarket', symbol: 'tok-btc', price: 50500, side: 'sell', settlementType: 'off_chain_clob' },
        tradeAmount: 0.1,
      });

      expect(analysis.estimatedGasUsd).toBe(0);
    });

    it('4.2: computes Polygon on-chain CTF gas formula when settlementType is on_chain_settle', () => {
      const analysis = calculator.evaluate({
        buyLeg: {
          venue: 'polymarket',
          symbol: 'tok-btc',
          price: 0.50,
          side: 'buy',
          settlementType: 'on_chain_settle',
        },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 0.55, side: 'sell' },
        tradeAmount: 2000,
      });

      // 150,000 * 50 * 1e-9 * 0.50 = 0.00375 USD
      expect(analysis.estimatedGasUsd).toBeCloseTo(0.00375, 4);
    });
  });

  // ── 5. Slippage Modeling ──────────────────────────────────────────────────
  describe('5. Slippage Modeling', () => {
    let calculator: NetProfitabilityCalculator;

    beforeEach(() => {
      calculator = new NetProfitabilityCalculator();
    });

    it('5.1: walks order book depth to compute accurate buy VWAP and slippage', () => {
      // Buy side walks asks: [(100, 2), (102, 3), (105, 5)]
      // Target: 5 units
      // Consumes 2 @ 100 ($200) + 3 @ 102 ($306) = $506 / 5 = VWAP $101.20
      // Best ask = 100. Slippage = $1.20 per unit = $6.00 total
      const orderBook = {
        asks: [[100, 2], [102, 3], [105, 5]] as [number, number][],
        bids: [] as [number, number][],
      };

      const res = calculator.calculateVwapSlippage(orderBook, 'buy', 5);
      expect(res.vwap).toBeCloseTo(101.20, 2);
      expect(res.slippageUsd).toBeCloseTo(6.00, 2);
      expect(res.slippageBps).toBeCloseTo(120, 1);
      expect(res.insufficientLiquidity).toBe(false);
      expect(res.filledAmount).toBe(5);
    });

    it('5.2: walks order book depth to compute sell VWAP consuming bids', () => {
      // Sell side walks bids: [(105, 3), (103, 2), (100, 5)]
      // Target: 5 units
      // Consumes 3 @ 105 ($315) + 2 @ 103 ($206) = $521 / 5 = VWAP $104.20
      // Best bid = 105. Slippage = $105 - $104.20 = $0.80 per unit = $4.00 total
      const orderBook = {
        asks: [] as [number, number][],
        bids: [[105, 3], [103, 2], [100, 5]] as [number, number][],
      };

      const res = calculator.calculateVwapSlippage(orderBook, 'sell', 5);
      expect(res.vwap).toBeCloseTo(104.20, 2);
      expect(res.slippageUsd).toBeCloseTo(4.00, 2);
      expect(res.insufficientLiquidity).toBe(false);
      expect(res.filledAmount).toBe(5);
    });

    it('5.3: flags insufficientLiquidity when book depth is less than requested amount', () => {
      const orderBook = {
        asks: [[100, 2]] as [number, number][],
        bids: [] as [number, number][],
      };

      const res = calculator.calculateVwapSlippage(orderBook, 'buy', 5);
      expect(res.insufficientLiquidity).toBe(true);
      expect(res.filledAmount).toBe(2);
      expect(res.vwap).toBe(100);
    });

    it('5.4: uses parametric volume impact fallback when orderbook depth is omitted', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: 0.1, // $5,000 notional
        slippageModel: 'volume_based',
      });

      expect(analysis.estimatedBuySlippageUsd).toBeGreaterThan(0);
      expect(analysis.estimatedSellSlippageUsd).toBeGreaterThan(0);
    });
  });

  // ── 6. Net Profitability Synthesis & Hurdle Gate ───────────────────────────
  describe('6. Net Profitability Synthesis & Hurdle Gate', () => {
    let calculator: NetProfitabilityCalculator;

    beforeEach(() => {
      calculator = new NetProfitabilityCalculator({ defaultHurdleBps: 10.0 });
    });

    it('6.1: admits highly profitable arbitrage exceeding 10 bps hurdle', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50250, side: 'sell' }, // 50 bps gross
        tradeAmount: 0.2, // $10,000 notional
        minHurdleBps: 10,
      });

      expect(analysis.grossSpreadUsd).toBe(50);
      expect(analysis.grossSpreadBps).toBe(50);
      expect(analysis.isProfitable).toBe(true);
      expect(analysis.netProfitBps).toBeGreaterThanOrEqual(10);
      expect(analysis.netProfitUsd).toBeGreaterThan(0);
      expect(analysis.rejectionReason).toBeUndefined();
    });

    it('6.2: rejects profitable trade below 10 bps hurdle with BELOW_HURDLE', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'ETH/USDT', price: 3000, side: 'buy' },
        sellLeg: { venue: 'kucoin', symbol: 'ETH/USDT', price: 3008, side: 'sell' }, // 26.6 bps gross
        tradeAmount: 1.0, // $3,000 notional
        minHurdleBps: 10,
      });

      // Total costs (~23 bps) leave net profit ~3.6 bps < 10 bps hurdle
      expect(analysis.isProfitable).toBe(false);
      expect(analysis.rejectionReason).toBe('BELOW_HURDLE');
    });

    it('6.3: fast-fails negative gross spread with NEGATIVE_GROSS_SPREAD', () => {
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50500, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 0.1,
      });

      expect(analysis.isProfitable).toBe(false);
      expect(analysis.grossSpreadUsd).toBeLessThan(0);
      expect(analysis.rejectionReason).toBe('NEGATIVE_GROSS_SPREAD');
    });

    it('6.4: rejects trade where fees exceed gross spread with MASSIVE_FEE_SPIKE', () => {
      // 10 bps gross spread vs 20 bps CEX roundtrip fee
      const analysis = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50025, side: 'sell' }, // 5 bps gross spread
        tradeAmount: 0.1,
      });

      expect(analysis.isProfitable).toBe(false);
      expect(analysis.rejectionReason).toBe('MASSIVE_FEE_SPIKE');
    });

    it('6.5: rejects micro-trade where gas cost wipes out spread with MASSIVE_GAS_SPIKE', () => {
      const analysis = calculator.evaluate({
        buyLeg: {
          venue: 'polymarket',
          symbol: 'tok-btc',
          price: 0.50,
          side: 'buy',
          settlementType: 'on_chain_settle',
        },
        sellLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 0.51, side: 'sell' }, // 2% gross
        tradeAmount: 1.0, // $0.50 micro-notional; spread is $0.01 USD, gas is ~$0.50 override
        gasOverrides: {
          polygonGasUsd: 0.50,
        },
      });

      expect(analysis.isProfitable).toBe(false);
      expect(analysis.rejectionReason).toBe('MASSIVE_GAS_SPIKE');
    });

    it('6.6: rejects trade with zero order book depth with ZERO_ORDERBOOK_DEPTH', () => {
      const analysis = calculator.evaluate({
        buyLeg: {
          venue: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          side: 'buy',
          orderBook: { asks: [], bids: [] },
        },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: 0.1,
      });

      expect(analysis.isProfitable).toBe(false);
      expect(analysis.rejectionReason).toBe('ZERO_ORDERBOOK_DEPTH');
    });

    it('6.7: guards division by zero and rejects invalid non-positive inputs with INVALID_INPUT', () => {
      const invalidRes1 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 0, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50000, side: 'sell' },
        tradeAmount: 0.1,
      });
      expect(invalidRes1.isProfitable).toBe(false);
      expect(invalidRes1.rejectionReason).toBe('INVALID_INPUT');

      const invalidRes2 = calculator.evaluate({
        buyLeg: { venue: 'binance', symbol: 'BTC/USDT', price: 50000, side: 'buy' },
        sellLeg: { venue: 'bybit', symbol: 'BTC/USDT', price: 50500, side: 'sell' },
        tradeAmount: -1,
      });
      expect(invalidRes2.isProfitable).toBe(false);
      expect(invalidRes2.rejectionReason).toBe('INVALID_INPUT');
    });
  });

  // ── 7. SpreadDetector Hook Integration & ArbitrageEngine ───────────────────
  describe('7. SpreadDetector Hook Integration & ArbitrageEngine', () => {
    it('7.1: wires to SpreadDetector onOpportunity hook and admits >= 10 bps hurdle', async () => {
      const admitted: ArbitrageOpportunity[] = [];
      const rejected: { opp: ArbitrageOpportunity; reason: string }[] = [];

      const engine = new ArbitrageEngine(
        {
          minHurdleBps: 10,
          baseNotionalUsd: 1000,
          dryRun: true,
        },
        {
          onAdmitted: (opp) => {
            admitted.push(opp);
          },
          onRejected: (opp, reason) => {
            rejected.push({ opp, reason });
          },
        }
      );

      const oppPassing: ArbitrageOpportunity = {
        id: 'opp-pass-1',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50300, // 60 bps gross -> net ~35 bps >= 10 bps
        spread: 300,
        spreadPercent: 0.60,
        timestamp: Date.now(),
        latency: 15,
      };

      const oppBelowHurdle: ArbitrageOpportunity = {
        id: 'opp-below-2',
        symbol: 'ETH/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 3000,
        sellPrice: 3008, // 26.6 bps gross -> fees 20 bps -> net ~3.6 bps < 10 bps hurdle
        spread: 8,
        spreadPercent: 0.266,
        timestamp: Date.now(),
        latency: 15,
      };

      const oppNegative: ArbitrageOpportunity = {
        id: 'opp-neg-3',
        symbol: 'SOL/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 150,
        sellPrice: 149, // negative spread
        spread: -1,
        spreadPercent: -0.66,
        timestamp: Date.now(),
        latency: 15,
      };

      engine.handleOpportunities([oppPassing, oppBelowHurdle, oppNegative]);
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(admitted).toHaveLength(1);
      expect(admitted[0].id).toBe('opp-pass-1');

      expect(rejected).toHaveLength(2);
      expect(rejected.find((r) => r.opp.id === 'opp-below-2')?.reason).toBe('BELOW_HURDLE');
      expect(rejected.find((r) => r.opp.id === 'opp-neg-3')?.reason).toBe('NEGATIVE_GROSS_SPREAD');
    });

    it('7.2: safely contains async exceptions without crashing caller', async () => {
      const mockCalculator = {
        fromSpreadOpportunity: vi.fn(() => {
          throw new Error('Database/Cache timeout');
        }),
      } as unknown as NetProfitabilityCalculator;

      const engine = new OpportunityIngestionPipeline(
        { minHurdleBps: 10 },
        { calculator: mockCalculator }
      );

      expect(() => {
        engine.handleOpportunities([
          {
            id: 'opp-err',
            symbol: 'BTC/USDT',
            buyExchange: 'binance',
            sellExchange: 'bybit',
            buyPrice: 50000,
            sellPrice: 50500,
            spread: 500,
            spreadPercent: 1.0,
            timestamp: Date.now(),
            latency: 10,
          },
        ]);
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(engine.metrics.rejectedCount).toBe(1);
    });

    it('7.3: deduplicates identical opportunities within TTL window', async () => {
      let evalCount = 0;
      const mockCalculator = {
        fromSpreadOpportunity: vi.fn(() => {
          evalCount++;
          return {
            isProfitable: false,
            rejectionReason: 'BELOW_HURDLE',
            netProfitBps: 0,
            netProfitUsd: 0,
            grossSpreadUsd: 100,
            grossSpreadBps: 20,
            estimatedBuyFeeUsd: 10,
            estimatedSellFeeUsd: 10,
            estimatedGasUsd: 0,
            estimatedBuySlippageUsd: 0,
            estimatedSellSlippageUsd: 0,
            totalCostUsd: 20,
          };
        }),
      } as unknown as NetProfitabilityCalculator;

      const engine = new ArbitrageEngine(
        { dedupTtlMs: 200 },
        { calculator: mockCalculator }
      );

      const opp: ArbitrageOpportunity = {
        id: 'opp-dup',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50100,
        spread: 100,
        spreadPercent: 0.2,
        timestamp: Date.now(),
        latency: 10,
      };

      engine.handleOpportunities([opp]);
      engine.handleOpportunities([opp]); // Immediate duplicate

      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(evalCount).toBe(1);
      expect(engine.metrics.dedupDroppedCount).toBe(1);
    });

    it('7.4: enforces queue capacity and drops oldest opportunities during backpressure', async () => {
      const engine = new ArbitrageEngine({
        maxQueueSize: 5,
        maxConcurrency: 1,
      });

      const opps: ArbitrageOpportunity[] = [];
      for (let i = 1; i <= 10; i++) {
        opps.push({
          id: `opp-flood-${i}`,
          symbol: `SYM-${i}/USDT`,
          buyExchange: 'binance',
          sellExchange: 'bybit',
          buyPrice: 100,
          sellPrice: 105,
          spread: 5,
          spreadPercent: 5.0,
          timestamp: Date.now(),
          latency: 10,
        });
      }

      engine.handleOpportunities(opps);
      expect(engine.metrics.queueDroppedCount).toBeGreaterThan(0);
    });

    it('7.5: start and stop control the underlying SpreadDetector lifecycle', () => {
      const mockDetector = {
        start: vi.fn(),
        stop: vi.fn(),
      } as unknown as SpreadDetector;

      const engine = new ArbitrageEngine(
        { symbols: ['BTC/USDT'], venues: ['binance', 'bybit'] },
        { spreadDetector: mockDetector }
      );

      engine.start();
      expect(mockDetector.start).toHaveBeenCalledWith(
        ['BTC/USDT'],
        ['binance', 'bybit'],
        expect.any(Function)
      );

      engine.stop();
      expect(mockDetector.stop).toHaveBeenCalled();
    });
  });
});
