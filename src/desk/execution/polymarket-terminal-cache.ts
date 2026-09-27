/**
 * Polymarket Terminal Order Cache
 * Manages bounded LRU + TTL caching for terminal/settled orders and reconciles asynchronous state events.
 */

import { type ExchangeOrderParams, type ExchangeOrderResult } from '../arbitrage/connectors/types';
import type { LiveOrderManager } from './live-order-manager';
import type { OrderState } from './live-order-manager-types';
import { logger } from '../../shared/utils/logger';
import {
  type TerminalCacheEntry,
  DEFAULT_TERMINAL_CACHE_CAPACITY,
  DEFAULT_TERMINAL_CACHE_TTL_MS,
} from './polymarket-connector-types';

export class PolymarketTerminalCache {
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly terminalOrderCache = new Map<string, TerminalCacheEntry>();
  private readonly clientOrderIdMap = new Map<string, string>();
  private readonly orderParamsCache = new Map<string, ExchangeOrderParams>();
  private readonly exchangeId = 'polymarket' as const;

  constructor(capacity = DEFAULT_TERMINAL_CACHE_CAPACITY, ttlMs = DEFAULT_TERMINAL_CACHE_TTL_MS) {
    this.capacity = capacity;
    this.ttlMs = ttlMs;
  }

  setTerminalOrder(orderId: string, result: ExchangeOrderResult): void {
    const now = Date.now();
    if (this.terminalOrderCache.has(orderId)) {
      this.terminalOrderCache.delete(orderId);
    } else {
      if (this.terminalOrderCache.size >= this.capacity) this.pruneExpired(now);
      if (this.terminalOrderCache.size >= this.capacity) {
        const oldestKey = this.terminalOrderCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.terminalOrderCache.delete(oldestKey);
          this.clientOrderIdMap.delete(oldestKey);
          this.orderParamsCache.delete(oldestKey);
        }
      }
    }
    this.terminalOrderCache.set(orderId, { order: result, cachedAt: now });
  }

  getTerminalOrder(orderId: string): ExchangeOrderResult | undefined {
    const entry = this.terminalOrderCache.get(orderId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.terminalOrderCache.delete(orderId);
      this.clientOrderIdMap.delete(orderId);
      this.orderParamsCache.delete(orderId);
      return undefined;
    }
    return entry.order;
  }

  setClientOrderId(orderId: string, clientOrderId?: string): void {
    if (!clientOrderId) return;
    if (this.clientOrderIdMap.size >= this.capacity) {
      const oldest = this.clientOrderIdMap.keys().next().value;
      if (oldest !== undefined) this.clientOrderIdMap.delete(oldest);
    }
    this.clientOrderIdMap.set(orderId, clientOrderId);
  }

  getClientOrderId(orderId: string): string | undefined {
    return this.clientOrderIdMap.get(orderId);
  }

  setOrderParams(orderId: string, params: ExchangeOrderParams): void {
    if (this.orderParamsCache.size >= this.capacity) {
      const oldest = this.orderParamsCache.keys().next().value;
      if (oldest !== undefined) this.orderParamsCache.delete(oldest);
    }
    this.orderParamsCache.set(orderId, params);
  }

  getOrderParams(orderId: string): ExchangeOrderParams | undefined {
    return this.orderParamsCache.get(orderId);
  }

  size(): number {
    return this.terminalOrderCache.size;
  }

  pruneExpired(now = Date.now()): void {
    for (const [key, entry] of this.terminalOrderCache.entries()) {
      if (now - entry.cachedAt > this.ttlMs) {
        this.terminalOrderCache.delete(key);
        this.clientOrderIdMap.delete(key);
        this.orderParamsCache.delete(key);
      }
    }
  }

  clear(): void {
    this.terminalOrderCache.clear();
    this.clientOrderIdMap.clear();
    this.orderParamsCache.clear();
  }

  handleLiveOrderFilled(state: OrderState): void {
    const existing = this.getTerminalOrder(state.orderId);
    const params = this.orderParamsCache.get(state.orderId);
    const clientOrderId = existing?.clientOrderId ?? params?.clientOrderId ?? this.clientOrderIdMap.get(state.orderId);

    const result: ExchangeOrderResult = {
      orderId: state.orderId,
      clientOrderId,
      exchange: this.exchangeId,
      symbol: state.tokenId,
      side: state.side.toLowerCase() as 'buy' | 'sell',
      price: state.price,
      amount: state.size,
      filled: state.size,
      remaining: 0,
      status: 'closed',
      fee: { amount: 0, currency: 'USDC' },
      timestamp: state.submittedAt || Date.now(),
    };

    this.setTerminalOrder(state.orderId, result);
    logger.debug(`[polymarket] Reconciled terminal fill for order ${state.orderId}`, {
      symbol: state.tokenId,
      size: state.size,
      price: state.price,
    });
  }

  handleLiveOrderTerminal(orderId: string, status: 'expired' | 'canceled', liveOrderManager?: LiveOrderManager): void {
    const existing = this.getTerminalOrder(orderId);
    if (existing) {
      this.setTerminalOrder(orderId, {
        ...existing,
        status,
        remaining: Math.max(0, existing.amount - existing.filled),
      });
      return;
    }

    const state = liveOrderManager?.getOrder(orderId);
    const params = this.orderParamsCache.get(orderId);
    const clientOrderId = params?.clientOrderId ?? this.clientOrderIdMap.get(orderId);

    const base: Partial<ExchangeOrderResult> = state
      ? { symbol: state.tokenId, side: state.side.toLowerCase() as 'buy' | 'sell', price: state.price, amount: state.size, timestamp: state.submittedAt || Date.now() }
      : params
      ? { symbol: params.symbol, side: params.side, price: params.price ?? 0, amount: params.amount, timestamp: Date.now() }
      : { symbol: 'unknown', side: 'buy', price: 0, amount: 0, timestamp: Date.now() };

    this.setTerminalOrder(orderId, {
      orderId,
      clientOrderId,
      exchange: this.exchangeId,
      symbol: base.symbol ?? 'unknown',
      side: base.side ?? 'buy',
      price: base.price ?? 0,
      amount: base.amount ?? 0,
      filled: 0,
      remaining: base.amount ?? 0,
      status,
      fee: { amount: 0, currency: 'USDC' },
      timestamp: base.timestamp ?? Date.now(),
    });
  }

  handleLiveOrderExpired(orderId: string, liveOrderManager?: LiveOrderManager): void {
    this.handleLiveOrderTerminal(orderId, 'expired', liveOrderManager);
  }

  handleLiveOrderCanceled(orderId: string, liveOrderManager?: LiveOrderManager): void {
    this.handleLiveOrderTerminal(orderId, 'canceled', liveOrderManager);
  }
}
