/**
 * Polymarket Connector Adapter
 * Implements IExchangeConnector for Polymarket CLOB prediction markets,
 * wrapping PolymarketAdapter and LiveOrderManager with 3-tier status resolution,
 * market order emulation, and balance interrogation.
 */

import {
  type IExchangeConnector,
  type ExchangeOrderParams,
  type ExchangeOrderResult,
  type ExchangeBalance,
  ExchangeOrderParamsSchema,
  OrderPlacementError,
  OrderCancellationError,
  OrderNotFoundError,
  ExchangeConnectorError,
} from '../arbitrage/connectors/types';
import type { PolymarketAdapter } from './polymarket-adapter';
import type { LiveOrderManager } from './live-order-manager';
import type { OrderState } from './live-order-manager-types';
import type { PolymarketOrder } from './polymarket-signer';
import { requireLiveEnabled } from './execution-mode';
import { logger } from '../../shared/utils/logger';
import { type PolymarketConnectorOptions as BasePolymarketConnectorOptions } from './polymarket-connector-types';
import { mapOpenOrder, mapLiveOrderStateStatus } from './polymarket-connector-mappers';

export const DEFAULT_TERMINAL_CACHE_CAPACITY = 1000;
export const DEFAULT_TERMINAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface TerminalCacheEntry {
  readonly order: ExchangeOrderResult;
  readonly cachedAt: number;
}

export interface PolymarketConnectorOptions extends BasePolymarketConnectorOptions {
  /** Max capacity of terminal order cache (default: 1000) */
  terminalCacheCapacity?: number;
  /** TTL of entries in terminal order cache in milliseconds (default: 3_600_000, i.e. 1 hour) */
  terminalCacheTtlMs?: number;
}

export * from './polymarket-connector-mappers';

export class PolymarketConnectorAdapter implements IExchangeConnector {
  readonly exchangeId = 'polymarket' as const;
  private readonly adapter: PolymarketAdapter;
  private readonly liveOrderManager?: LiveOrderManager;
  private readonly options: PolymarketConnectorOptions;
  private readonly terminalCacheCapacity: number;
  private readonly terminalCacheTtlMs: number;

  // Tier 3: Terminal order cache for matched/canceled/expired orders with TTL and LRU bounding
  private readonly terminalOrderCache = new Map<string, TerminalCacheEntry>();
  private readonly clientOrderIdMap = new Map<string, string>();
  private readonly orderParamsCache = new Map<string, ExchangeOrderParams>();

  // ── Bound LiveOrderManager Event Handlers ───────────────────────────────────
  private readonly onLiveOrderFilled = (state: OrderState): void => {
    this.handleLiveOrderFilled(state);
  };

  private readonly onLiveOrderExpired = (orderId: string): void => {
    this.handleLiveOrderExpired(orderId);
  };

  private readonly onLiveOrderCanceled = (orderId: string): void => {
    this.handleLiveOrderCanceled(orderId);
  };

  constructor(
    adapter: PolymarketAdapter,
    liveOrderManager?: LiveOrderManager,
    options?: PolymarketConnectorOptions
  ) {
    this.adapter = adapter;
    this.liveOrderManager = liveOrderManager;
    this.options = options ?? {};
    this.terminalCacheCapacity = this.options.terminalCacheCapacity ?? DEFAULT_TERMINAL_CACHE_CAPACITY;
    this.terminalCacheTtlMs = this.options.terminalCacheTtlMs ?? DEFAULT_TERMINAL_CACHE_TTL_MS;

    // Attach lifecycle listeners to LiveOrderManager for async fill reconciliation
    if (this.liveOrderManager && typeof (this.liveOrderManager as unknown as { on?: unknown }).on === 'function') {
      const emitter = this.liveOrderManager as unknown as {
        on: (event: string, listener: (...args: unknown[]) => void) => void;
      };
      emitter.on('filled', this.onLiveOrderFilled as unknown as (...args: unknown[]) => void);
      emitter.on('expired', this.onLiveOrderExpired as unknown as (...args: unknown[]) => void);
      emitter.on('canceled', this.onLiveOrderCanceled as unknown as (...args: unknown[]) => void);
    }
  }

  /**
   * Clean up event listeners and clear cached terminal entries.
   */
  dispose(): void {
    if (this.liveOrderManager) {
      const mgr = this.liveOrderManager as unknown as {
        off?: (event: string, listener: (...args: unknown[]) => void) => void;
        removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
      };
      if (typeof mgr.off === 'function') {
        mgr.off('filled', this.onLiveOrderFilled as unknown as (...args: unknown[]) => void);
        mgr.off('expired', this.onLiveOrderExpired as unknown as (...args: unknown[]) => void);
        mgr.off('canceled', this.onLiveOrderCanceled as unknown as (...args: unknown[]) => void);
      } else if (typeof mgr.removeListener === 'function') {
        mgr.removeListener('filled', this.onLiveOrderFilled as unknown as (...args: unknown[]) => void);
        mgr.removeListener('expired', this.onLiveOrderExpired as unknown as (...args: unknown[]) => void);
        mgr.removeListener('canceled', this.onLiveOrderCanceled as unknown as (...args: unknown[]) => void);
      }
    }
    this.clearTerminalCache();
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    const validated = ExchangeOrderParamsSchema.parse(params);

    if (this.options.dryRun === false) {
      requireLiveEnabled('PolymarketConnectorAdapter.placeOrder');
    }

    let execPrice = validated.price;
    if (validated.type === 'market' || execPrice === undefined) {
      execPrice = validated.side === 'buy' ? 0.99 : 0.01;
    }

    const expiration = Math.floor(Date.now() / 1000) + (this.options.defaultExpirationSec ?? 300);
    const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const polyOrder: PolymarketOrder = {
      tokenId: validated.symbol,
      price: execPrice,
      size: validated.amount,
      side: validated.side.toUpperCase() as 'BUY' | 'SELL',
      expiration,
      nonce,
      feeRateBps: this.options.defaultFeeRateBps ?? 0,
      signatureType: this.options.defaultSignatureType ?? 0,
    };

    try {
      let orderId: string;
      let isMatched = false;

      if (this.liveOrderManager) {
        const resp = await this.liveOrderManager.submitAndTrack(polyOrder);
        orderId = resp.orderID;
        isMatched = resp.status === 'matched';
      } else {
        const resp = await this.adapter.placeOrder(polyOrder);
        orderId = resp.orderID;
        isMatched = resp.status === 'matched';
      }

      this.setOrderParams(orderId, validated);
      if (validated.clientOrderId) {
        this.setClientOrderId(orderId, validated.clientOrderId);
      }

      const result: ExchangeOrderResult = {
        orderId,
        clientOrderId: validated.clientOrderId,
        exchange: this.exchangeId,
        symbol: validated.symbol,
        side: validated.side,
        price: execPrice,
        amount: validated.amount,
        filled: isMatched ? validated.amount : 0,
        remaining: isMatched ? 0 : validated.amount,
        status: isMatched ? 'closed' : 'open',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: Date.now(),
      };

      if (isMatched) {
        this.setTerminalOrder(orderId, result);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[polymarket] placeOrder failed: ${msg}`, {
        symbol: validated.symbol,
        side: validated.side,
        amount: validated.amount,
        price: execPrice,
      });

      if (err instanceof ExchangeConnectorError) {
        throw err;
      }
      throw new OrderPlacementError(msg, this.exchangeId);
    }
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    if (!orderId) {
      throw new OrderCancellationError('orderId is required', this.exchangeId);
    }

    try {
      if (this.liveOrderManager) {
        await this.liveOrderManager.cancelOrder(orderId);
      } else {
        const res = await this.adapter.cancelOrder(orderId);
        if (!res.canceled) return false;
      }

      const cached = this.getTerminalOrder(orderId);
      if (cached) {
        this.setTerminalOrder(orderId, { ...cached, status: 'canceled' });
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[polymarket] cancelOrder warning for ${orderId}: ${msg}`);
      return false;
    }
  }

  async fetchOrder(orderId: string, _symbol: string): Promise<ExchangeOrderResult> {
    if (!orderId) {
      throw new OrderNotFoundError('orderId is required', this.exchangeId);
    }

    // Tier 1: Check terminal order cache first (authoritative terminal status)
    const cached = this.getTerminalOrder(orderId);
    if (cached) {
      return cached;
    }

    // Tier 2: Check LiveOrderManager active tracking
    if (this.liveOrderManager) {
      const activeState = this.liveOrderManager.getOrder(orderId);
      if (activeState) {
        const status = mapLiveOrderStateStatus(activeState.status);
        const filled = status === 'closed' ? activeState.size : 0;
        const remaining = status === 'closed' ? 0 : activeState.size;
        const clientOrderId = this.clientOrderIdMap.get(orderId);

        const res: ExchangeOrderResult = {
          orderId: activeState.orderId,
          clientOrderId,
          exchange: this.exchangeId,
          symbol: activeState.tokenId,
          side: activeState.side.toLowerCase() as 'buy' | 'sell',
          price: activeState.price,
          amount: activeState.size,
          filled,
          remaining,
          status,
          fee: { amount: 0, currency: 'USDC' },
          timestamp: activeState.submittedAt,
        };

        if (status === 'closed' || status === 'canceled' || status === 'expired') {
          this.setTerminalOrder(orderId, res);
        }
        return res;
      }
    }

    // Tier 3: Query CLOB open orders from adapter
    try {
      const openOrders = await this.adapter.getOpenOrders();
      const openOrder = openOrders.find((o) => o.id === orderId);

      if (openOrder) {
        const mapped = mapOpenOrder(this.exchangeId, openOrder);
        const resWithCoid: ExchangeOrderResult = {
          ...mapped,
          clientOrderId: this.clientOrderIdMap.get(orderId) ?? mapped.clientOrderId,
        };
        if (resWithCoid.status === 'closed') {
          this.setTerminalOrder(orderId, resWithCoid);
        }
        return resWithCoid;
      }
    } catch (err) {
      logger.warn(`[polymarket] getOpenOrders failed during fetchOrder: ${String(err)}`);
    }

    throw new OrderNotFoundError(orderId, this.exchangeId);
  }

  // ── Terminal Cache Management (Bounded LRU & TTL) ──────────────────────────

  private setTerminalOrder(orderId: string, result: ExchangeOrderResult): void {
    const now = Date.now();

    // If already exists, delete first to move key to end of Map (MRU order)
    if (this.terminalOrderCache.has(orderId)) {
      this.terminalOrderCache.delete(orderId);
    } else {
      if (this.terminalOrderCache.size >= this.terminalCacheCapacity) {
        this.pruneExpiredTerminalOrders(now);
      }
      if (this.terminalOrderCache.size >= this.terminalCacheCapacity) {
        const oldestKey = this.terminalOrderCache.keys().next().value;
        if (oldestKey !== undefined) {
          this.terminalOrderCache.delete(oldestKey);
          this.clientOrderIdMap.delete(oldestKey);
          this.orderParamsCache.delete(oldestKey);
        }
      }
    }

    this.terminalOrderCache.set(orderId, {
      order: result,
      cachedAt: now,
    });
  }

  private getTerminalOrder(orderId: string): ExchangeOrderResult | undefined {
    const entry = this.terminalOrderCache.get(orderId);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.cachedAt > this.terminalCacheTtlMs) {
      this.terminalOrderCache.delete(orderId);
      this.clientOrderIdMap.delete(orderId);
      this.orderParamsCache.delete(orderId);
      return undefined;
    }

    return entry.order;
  }

  private pruneExpiredTerminalOrders(now = Date.now()): void {
    for (const [key, entry] of this.terminalOrderCache.entries()) {
      if (now - entry.cachedAt > this.terminalCacheTtlMs) {
        this.terminalOrderCache.delete(key);
        this.clientOrderIdMap.delete(key);
        this.orderParamsCache.delete(key);
      }
    }
  }

  private setClientOrderId(orderId: string, clientOrderId?: string): void {
    if (!clientOrderId) return;
    if (this.clientOrderIdMap.size >= this.terminalCacheCapacity) {
      const oldest = this.clientOrderIdMap.keys().next().value;
      if (oldest !== undefined) {
        this.clientOrderIdMap.delete(oldest);
      }
    }
    this.clientOrderIdMap.set(orderId, clientOrderId);
  }

  private setOrderParams(orderId: string, params: ExchangeOrderParams): void {
    if (this.orderParamsCache.size >= this.terminalCacheCapacity) {
      const oldest = this.orderParamsCache.keys().next().value;
      if (oldest !== undefined) {
        this.orderParamsCache.delete(oldest);
      }
    }
    this.orderParamsCache.set(orderId, params);
  }

  getTerminalCacheSize(): number {
    return this.terminalOrderCache.size;
  }

  pruneTerminalCache(): void {
    this.pruneExpiredTerminalOrders();
  }

  clearTerminalCache(): void {
    this.terminalOrderCache.clear();
    this.clientOrderIdMap.clear();
    this.orderParamsCache.clear();
  }

  // ── Asynchronous Event Handlers ────────────────────────────────────────────

  private handleLiveOrderFilled(state: OrderState): void {
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

  private handleLiveOrderExpired(orderId: string): void {
    const existing = this.getTerminalOrder(orderId);
    if (existing) {
      this.setTerminalOrder(orderId, {
        ...existing,
        status: 'expired',
        remaining: Math.max(0, existing.amount - existing.filled),
      });
      return;
    }

    const state = this.liveOrderManager?.getOrder(orderId);
    const params = this.orderParamsCache.get(orderId);
    const clientOrderId = params?.clientOrderId ?? this.clientOrderIdMap.get(orderId);

    if (state) {
      const result: ExchangeOrderResult = {
        orderId: state.orderId,
        clientOrderId,
        exchange: this.exchangeId,
        symbol: state.tokenId,
        side: state.side.toLowerCase() as 'buy' | 'sell',
        price: state.price,
        amount: state.size,
        filled: 0,
        remaining: state.size,
        status: 'expired',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: state.submittedAt || Date.now(),
      };
      this.setTerminalOrder(orderId, result);
      return;
    }

    if (params) {
      const result: ExchangeOrderResult = {
        orderId,
        clientOrderId,
        exchange: this.exchangeId,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 0,
        amount: params.amount,
        filled: 0,
        remaining: params.amount,
        status: 'expired',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: Date.now(),
      };
      this.setTerminalOrder(orderId, result);
      return;
    }

    this.setTerminalOrder(orderId, {
      orderId,
      clientOrderId,
      exchange: this.exchangeId,
      symbol: 'unknown',
      side: 'buy',
      price: 0,
      amount: 0,
      filled: 0,
      remaining: 0,
      status: 'expired',
      fee: { amount: 0, currency: 'USDC' },
      timestamp: Date.now(),
    });
  }

  private handleLiveOrderCanceled(orderId: string): void {
    const existing = this.getTerminalOrder(orderId);
    if (existing) {
      this.setTerminalOrder(orderId, {
        ...existing,
        status: 'canceled',
        remaining: Math.max(0, existing.amount - existing.filled),
      });
      return;
    }

    const state = this.liveOrderManager?.getOrder(orderId);
    const params = this.orderParamsCache.get(orderId);
    const clientOrderId = params?.clientOrderId ?? this.clientOrderIdMap.get(orderId);

    if (state) {
      const result: ExchangeOrderResult = {
        orderId: state.orderId,
        clientOrderId,
        exchange: this.exchangeId,
        symbol: state.tokenId,
        side: state.side.toLowerCase() as 'buy' | 'sell',
        price: state.price,
        amount: state.size,
        filled: 0,
        remaining: state.size,
        status: 'canceled',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: state.submittedAt || Date.now(),
      };
      this.setTerminalOrder(orderId, result);
      return;
    }

    if (params) {
      const result: ExchangeOrderResult = {
        orderId,
        clientOrderId,
        exchange: this.exchangeId,
        symbol: params.symbol,
        side: params.side,
        price: params.price ?? 0,
        amount: params.amount,
        filled: 0,
        remaining: params.amount,
        status: 'canceled',
        fee: { amount: 0, currency: 'USDC' },
        timestamp: Date.now(),
      };
      this.setTerminalOrder(orderId, result);
      return;
    }

    this.setTerminalOrder(orderId, {
      orderId,
      clientOrderId,
      exchange: this.exchangeId,
      symbol: 'unknown',
      side: 'buy',
      price: 0,
      amount: 0,
      filled: 0,
      remaining: 0,
      status: 'canceled',
      fee: { amount: 0, currency: 'USDC' },
      timestamp: Date.now(),
    });
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    if (this.options.balanceProvider) {
      return this.options.balanceProvider();
    }

    const balances: ExchangeBalance = {};
    const defaultUsdc = this.options.defaultUsdcBalance ?? 10_000;
    let usedUsdc = 0;

    if (this.liveOrderManager) {
      for (const order of this.liveOrderManager.getActiveOrders()) {
        if (order.side === 'BUY' && (order.status === 'pending' || order.status === 'delayed')) {
          usedUsdc += order.size * order.price;
        }
      }

      const tracker = this.liveOrderManager.positionTracker;
      if (tracker && typeof tracker.getPositions === 'function') {
        for (const pos of tracker.getPositions()) {
          if (pos.size > 0) {
            balances[pos.tokenId] = {
              free: pos.size,
              used: 0,
              total: pos.size,
            };
          }
        }
      }
    }

    const freeUsdc = Math.max(0, defaultUsdc - usedUsdc);
    balances.USDC = {
      free: freeUsdc,
      used: usedUsdc,
      total: defaultUsdc,
    };

    return balances;
  }

  async getLatencyMs(): Promise<number> {
    const start = Date.now();
    try {
      const probeToken = this.options.latencyProbeTokenId ?? 'test-probe-token';
      await this.adapter.getOrderBook(probeToken).catch(() => null);
      return Math.max(0, Date.now() - start);
    } catch {
      return Math.max(0, Date.now() - start);
    }
  }
}
