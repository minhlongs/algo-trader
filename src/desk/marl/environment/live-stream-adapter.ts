/**
 * Live Stream Adapter for MARL Market-Making.
 * Connects Polymarket CLOB and CEX WebSocket feeds to the MARL environment,
 * handles disconnect safety tripwires, and emits normalized observations.
 */

import { EventEmitter } from 'events';
import type { MarlOrderBook, AgentObservation } from '../types/marl-types';
import { OrderBookNormalizer, type RawClobOrderBook } from './orderbook-normalizer';
import { logger } from '../../../shared/utils/logger';

export interface LiveStreamAdapterConfig {
  symbol: string;
  venue?: string;
  heartbeatTimeoutMs?: number;
  autoReconnect?: boolean;
}

export class LiveStreamAdapter extends EventEmitter {
  private isConnected = false;
  private lastUpdateTimestamp = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private currentBook: MarlOrderBook | null = null;
  private readonly venue: string;
  private readonly heartbeatTimeoutMs: number;

  constructor(private readonly config: LiveStreamAdapterConfig) {
    super();
    this.venue = config.venue ?? 'polymarket';
    this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? 15_000;
  }

  public start(): void {
    if (this.isConnected) return;
    this.isConnected = true;
    this.lastUpdateTimestamp = Date.now();

    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeat();
    }, 5_000);

    logger.info('[LiveStreamAdapter] Started live orderbook stream adapter', {
      symbol: this.config.symbol,
      venue: this.venue,
    });
    this.emit('connected');
  }

  public stop(): void {
    if (!this.isConnected) return;
    this.isConnected = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    logger.info('[LiveStreamAdapter] Stopped live stream adapter', {
      symbol: this.config.symbol,
    });
    this.emit('disconnected');
    this.emit('cancel_all_quotes');
  }

  public ingestRawClob(raw: RawClobOrderBook): MarlOrderBook {
    this.lastUpdateTimestamp = Date.now();
    const book = OrderBookNormalizer.normalizeClob(raw, this.venue);
    this.currentBook = book;
    this.emit('orderbook', book);

    const observation = OrderBookNormalizer.toObservation(book);
    this.emit('observation', observation);
    return book;
  }

  public ingestOrderBook(book: MarlOrderBook): void {
    this.lastUpdateTimestamp = Date.now();
    this.currentBook = book;
    this.emit('orderbook', book);

    const observation = OrderBookNormalizer.toObservation(book);
    this.emit('observation', observation);
  }

  private checkHeartbeat(): void {
    if (!this.isConnected) return;
    const elapsed = Date.now() - this.lastUpdateTimestamp;
    if (elapsed > this.heartbeatTimeoutMs) {
      logger.warn('[LiveStreamAdapter] Feed stale, heartbeat timeout exceeded', {
        elapsedMs: elapsed,
        timeoutMs: this.heartbeatTimeoutMs,
      });
      // Safety tripwire: trigger defensive quote cancellation on feed staleness
      this.emit('stale_feed', { elapsedMs: elapsed });
      this.emit('cancel_all_quotes');
    }
  }

  public getCurrentBook(): MarlOrderBook | null {
    return this.currentBook;
  }

  public getObservation(inventory = 0): AgentObservation | null {
    if (!this.currentBook) return null;
    return OrderBookNormalizer.toObservation(this.currentBook, inventory);
  }

  public isFeedHealthy(): boolean {
    if (!this.isConnected) return false;
    return Date.now() - this.lastUpdateTimestamp <= this.heartbeatTimeoutMs;
  }
}
