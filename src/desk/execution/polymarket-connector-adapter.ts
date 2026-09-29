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
  OrderCancellationError,
} from '../arbitrage/connectors/types';
import type { PolymarketAdapter } from './polymarket-adapter';
import type { LiveOrderManager } from './live-order-manager';
import type { OrderState } from './live-order-manager-types';
import { logger } from '../../shared/utils/logger';
import {
  type PolymarketConnectorOptions,
  DEFAULT_TERMINAL_CACHE_CAPACITY,
  DEFAULT_TERMINAL_CACHE_TTL_MS,
} from './polymarket-connector-types';
import { PolymarketTerminalCache } from './polymarket-terminal-cache';
import { fetchPolymarketBalance } from './polymarket-balance-provider';
import { executePolymarketOrder } from './polymarket-order-executor';
import { fetchPolymarketOrder } from './polymarket-order-fetcher';

export * from './polymarket-connector-types';
export * from './polymarket-connector-mappers';
export * from './polymarket-terminal-cache';
export * from './polymarket-balance-provider';
export * from './polymarket-order-executor';
export * from './polymarket-order-fetcher';

export class PolymarketConnectorAdapter implements IExchangeConnector {
  readonly exchangeId = 'polymarket' as const;
  private readonly adapter: PolymarketAdapter;
  private readonly liveOrderManager?: LiveOrderManager;
  private readonly options: PolymarketConnectorOptions;
  private readonly cache: PolymarketTerminalCache;

  private readonly onLiveOrderFilled = (state: OrderState): void => {
    this.cache.handleLiveOrderFilled(state);
  };
  private readonly onLiveOrderExpired = (orderId: string): void => {
    this.cache.handleLiveOrderExpired(orderId, this.liveOrderManager);
  };
  private readonly onLiveOrderCanceled = (orderId: string): void => {
    this.cache.handleLiveOrderCanceled(orderId, this.liveOrderManager);
  };

  constructor(
    adapter: PolymarketAdapter,
    liveOrderManager?: LiveOrderManager,
    options?: PolymarketConnectorOptions
  ) {
    this.adapter = adapter;
    this.liveOrderManager = liveOrderManager;
    this.options = options ?? {};
    const capacity = this.options.terminalCacheCapacity ?? DEFAULT_TERMINAL_CACHE_CAPACITY;
    const ttlMs = this.options.terminalCacheTtlMs ?? DEFAULT_TERMINAL_CACHE_TTL_MS;
    this.cache = new PolymarketTerminalCache(capacity, ttlMs);

    if (this.liveOrderManager && typeof (this.liveOrderManager as unknown as { on?: unknown }).on === 'function') {
      const emitter = this.liveOrderManager as unknown as {
        on: (event: string, listener: (...args: unknown[]) => void) => void;
      };
      emitter.on('filled', this.onLiveOrderFilled as unknown as (...args: unknown[]) => void);
      emitter.on('expired', this.onLiveOrderExpired as unknown as (...args: unknown[]) => void);
      emitter.on('canceled', this.onLiveOrderCanceled as unknown as (...args: unknown[]) => void);
    }
  }

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
    this.cache.clear();
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    return executePolymarketOrder(params, this.adapter, this.options, this.cache, this.liveOrderManager);
  }

  async cancelOrder(orderId: string, _symbol: string): Promise<boolean> {
    if (!orderId) throw new OrderCancellationError('orderId is required', this.exchangeId);

    try {
      if (this.liveOrderManager) {
        await this.liveOrderManager.cancelOrder(orderId);
      } else {
        const res = await this.adapter.cancelOrder(orderId);
        if (!res.canceled) return false;
      }

      const cached = this.cache.getTerminalOrder(orderId);
      if (cached) {
        this.cache.setTerminalOrder(orderId, { ...cached, status: 'canceled' });
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[polymarket] cancelOrder warning for ${orderId}: ${msg}`);
      return false;
    }
  }

  async fetchOrder(orderId: string, _symbol: string): Promise<ExchangeOrderResult> {
    return fetchPolymarketOrder(orderId, this.adapter, this.cache, this.liveOrderManager);
  }

  getTerminalCacheSize(): number {
    return this.cache.size();
  }

  pruneTerminalCache(): void {
    this.cache.pruneExpired();
  }

  clearTerminalCache(): void {
    this.cache.clear();
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    return fetchPolymarketBalance(this.options, this.liveOrderManager);
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
