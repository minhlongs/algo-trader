import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketTerminalCache } from '../../../../src/desk/execution/polymarket-terminal-cache';
import type { ExchangeOrderResult, ExchangeOrderParams } from '../../../../src/desk/arbitrage/connectors/types';
import type { OrderState } from '../../../../src/desk/execution/live-order-manager-types';

describe('PolymarketTerminalCache', () => {
  let cache: PolymarketTerminalCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new PolymarketTerminalCache(3, 1000); // capacity 3, ttl 1000ms
  });

  const makeOrderResult = (orderId: string, clientOrderId?: string): ExchangeOrderResult => ({
    orderId,
    clientOrderId,
    exchange: 'polymarket',
    symbol: 'tok-1',
    side: 'buy',
    price: 0.5,
    amount: 10,
    filled: 10,
    remaining: 0,
    status: 'closed',
    fee: { amount: 0, currency: 'USDC' },
    timestamp: Date.now(),
  });

  describe('Basic operations & Capacity / TTL', () => {
    it('initializes with default parameters when omitted', () => {
      const defaultCache = new PolymarketTerminalCache();
      expect(defaultCache.size()).toBe(0);
    });

    it('sets and gets terminal order within TTL', () => {
      const order = makeOrderResult('ord-1');
      cache.setTerminalOrder('ord-1', order);
      expect(cache.size()).toBe(1);
      expect(cache.getTerminalOrder('ord-1')).toEqual(order);
    });

    it('returns undefined for non-existent order', () => {
      expect(cache.getTerminalOrder('non-existent')).toBeUndefined();
    });

    it('returns undefined and evicts expired order on getTerminalOrder', () => {
      const order = makeOrderResult('ord-exp');
      cache.setTerminalOrder('ord-exp', order);

      // Advance time beyond TTL (1000ms)
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
      expect(cache.getTerminalOrder('ord-exp')).toBeUndefined();
      expect(cache.size()).toBe(0);
      nowSpy.mockRestore();
    });

    it('replaces existing terminal order and resets position in cache', () => {
      const ord1 = makeOrderResult('ord-1');
      const ord2 = { ...ord1, price: 0.6 };
      cache.setTerminalOrder('ord-1', ord1);
      cache.setTerminalOrder('ord-1', ord2);
      expect(cache.size()).toBe(1);
      expect(cache.getTerminalOrder('ord-1')?.price).toBe(0.6);
    });

    it('prunes expired entries when capacity reached', () => {
      let currentTime = 10000;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      // Insert 3 orders
      cache.setTerminalOrder('ord-1', makeOrderResult('ord-1'));
      cache.setTerminalOrder('ord-2', makeOrderResult('ord-2'));
      cache.setTerminalOrder('ord-3', makeOrderResult('ord-3'));
      expect(cache.size()).toBe(3);

      // Make ord-1 expired
      currentTime = 11500; // > 1000ms TTL

      // Insert 4th order -> should prune expired and insert ord-4
      cache.setTerminalOrder('ord-4', makeOrderResult('ord-4'));
      expect(cache.getTerminalOrder('ord-1')).toBeUndefined();
      expect(cache.getTerminalOrder('ord-4')).toBeDefined();

      nowSpy.mockRestore();
    });

    it('evicts oldest entry if capacity reached and no entries expired', () => {
      cache.setClientOrderId('ord-1', 'client-1');
      cache.setOrderParams('ord-1', { symbol: 'tok-1', side: 'buy', amount: 10 });
      cache.setTerminalOrder('ord-1', makeOrderResult('ord-1'));

      cache.setTerminalOrder('ord-2', makeOrderResult('ord-2'));
      cache.setTerminalOrder('ord-3', makeOrderResult('ord-3'));
      expect(cache.size()).toBe(3);

      // Insert 4th with zero time delta (no expiry)
      cache.setTerminalOrder('ord-4', makeOrderResult('ord-4'));
      expect(cache.size()).toBe(3);
      expect(cache.getTerminalOrder('ord-1')).toBeUndefined();
      expect(cache.getClientOrderId('ord-1')).toBeUndefined();
      expect(cache.getOrderParams('ord-1')).toBeUndefined();
      expect(cache.getTerminalOrder('ord-4')).toBeDefined();
    });

    it('handles clientOrderIdMap and orderParamsCache capacity eviction and getters', () => {
      // clientOrderIdMap capacity check
      cache.setClientOrderId('o1', undefined);
      expect(cache.getClientOrderId('o1')).toBeUndefined();

      cache.setClientOrderId('o1', 'c1');
      cache.setClientOrderId('o2', 'c2');
      cache.setClientOrderId('o3', 'c3');
      cache.setClientOrderId('o4', 'c4'); // evicts o1
      expect(cache.getClientOrderId('o1')).toBeUndefined();
      expect(cache.getClientOrderId('o4')).toBe('c4');

      // orderParamsCache capacity check
      const param = (sym: string): ExchangeOrderParams => ({ symbol: sym, side: 'buy', amount: 5 });
      cache.setOrderParams('p1', param('s1'));
      cache.setOrderParams('p2', param('s2'));
      cache.setOrderParams('p3', param('s3'));
      cache.setOrderParams('p4', param('s4')); // evicts p1
      expect(cache.getOrderParams('p1')).toBeUndefined();
      expect(cache.getOrderParams('p4')?.symbol).toBe('s4');
    });

    it('clears all caches when clear() is called', () => {
      cache.setTerminalOrder('o1', makeOrderResult('o1'));
      cache.setClientOrderId('o1', 'c1');
      cache.setOrderParams('o1', { symbol: 's1', side: 'buy', amount: 5 });

      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.getClientOrderId('o1')).toBeUndefined();
      expect(cache.getOrderParams('o1')).toBeUndefined();
    });
  });

  describe('Order reconciliation handlers', () => {
    it('handles handleLiveOrderFilled with existing terminal order clientOrderId', () => {
      cache.setTerminalOrder('ord-fill-1', makeOrderResult('ord-fill-1', 'client-existing'));

      const state: OrderState = {
        orderId: 'ord-fill-1',
        tokenId: 'token-abc',
        side: 'BUY',
        price: 0.55,
        size: 20,
        status: 'matched',
        submittedAt: 1700000000000,
      };

      cache.handleLiveOrderFilled(state);
      const res = cache.getTerminalOrder('ord-fill-1');
      expect(res).toBeDefined();
      expect(res?.clientOrderId).toBe('client-existing');
      expect(res?.status).toBe('closed');
      expect(res?.filled).toBe(20);
      expect(res?.remaining).toBe(0);
      expect(res?.price).toBe(0.55);
      expect(res?.timestamp).toBe(1700000000000);
    });

    it('handles handleLiveOrderFilled falling back to orderParamsCache or clientOrderIdMap or Date.now', () => {
      // 1. Fallback to orderParamsCache clientOrderId
      cache.setOrderParams('ord-fill-2', { symbol: 'tok-2', side: 'buy', amount: 10, clientOrderId: 'param-client' });
      const state2: OrderState = {
        orderId: 'ord-fill-2',
        tokenId: 'tok-2',
        side: 'SELL',
        price: 0.45,
        size: 10,
        status: 'matched',
        submittedAt: 0,
      };
      cache.handleLiveOrderFilled(state2);
      expect(cache.getTerminalOrder('ord-fill-2')?.clientOrderId).toBe('param-client');
      expect(cache.getTerminalOrder('ord-fill-2')?.side).toBe('sell');

      // 2. Fallback to clientOrderIdMap
      cache.setClientOrderId('ord-fill-3', 'map-client');
      const state3: OrderState = {
        orderId: 'ord-fill-3',
        tokenId: 'tok-3',
        side: 'BUY',
        price: 0.50,
        size: 5,
        status: 'matched',
      };
      cache.handleLiveOrderFilled(state3);
      expect(cache.getTerminalOrder('ord-fill-3')?.clientOrderId).toBe('map-client');
    });

    it('handles handleLiveOrderTerminal when order already exists in terminal cache', () => {
      const existing: ExchangeOrderResult = {
        orderId: 'ord-term-1',
        exchange: 'polymarket',
        symbol: 'tok-1',
        side: 'buy',
        price: 0.5,
        amount: 10,
        filled: 4,
        remaining: 6,
        status: 'open',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: Date.now(),
      };
      cache.setTerminalOrder('ord-term-1', existing);

      cache.handleLiveOrderCanceled('ord-term-1');
      const res = cache.getTerminalOrder('ord-term-1');
      expect(res?.status).toBe('canceled');
      expect(res?.remaining).toBe(6);
    });

    it('handles handleLiveOrderExpired with liveOrderManager state fallback and zero submittedAt', () => {
      const mockOrderManager = {
        getOrder: vi.fn().mockReturnValue({
          orderId: 'ord-lom',
          tokenId: 'tok-lom',
          side: 'BUY',
          price: 0.72,
          size: 15,
          submittedAt: 0,
        }),
      };

      cache.handleLiveOrderExpired('ord-lom', mockOrderManager as never);
      const res = cache.getTerminalOrder('ord-lom');
      expect(res).toBeDefined();
      expect(res?.status).toBe('expired');
      expect(res?.symbol).toBe('tok-lom');
      expect(res?.price).toBe(0.72);
      expect(res?.amount).toBe(15);
      expect(res?.remaining).toBe(15);
      expect(res?.timestamp).toBeGreaterThan(0);
    });

    it('handles handleLiveOrderTerminal with orderParams fallback and undefined price', () => {
      cache.setOrderParams('ord-param-only', {
        symbol: 'tok-param',
        side: 'sell',
        price: undefined,
        amount: 8,
        clientOrderId: 'client-p',
      });

      cache.handleLiveOrderCanceled('ord-param-only');
      const res = cache.getTerminalOrder('ord-param-only');
      expect(res).toBeDefined();
      expect(res?.status).toBe('canceled');
      expect(res?.clientOrderId).toBe('client-p');
      expect(res?.symbol).toBe('tok-param');
      expect(res?.price).toBe(0);
      expect(res?.amount).toBe(8);
    });

    it('handles handleLiveOrderTerminal with unknown fallback when no state or params exist', () => {
      cache.handleLiveOrderExpired('ord-unknown');
      const res = cache.getTerminalOrder('ord-unknown');
      expect(res).toBeDefined();
      expect(res?.status).toBe('expired');
      expect(res?.symbol).toBe('unknown');
      expect(res?.price).toBe(0);
      expect(res?.amount).toBe(0);
      expect(res?.side).toBe('buy');
    });
  });
});
