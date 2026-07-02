/**
 * Orderbook Stream — V2 migration compatibility stub.
 *
 * Maintains a live WebSocket connection to the Polymarket
 * CLOB orderbook and emits price updates.
 * NOTE: Placeholder for the streaming orderbook module.
 */
import { EventEmitter } from 'events';
import { logger } from '../core/logger';

export class OrderBookStream extends EventEmitter {
  private connected = false;

  subscribe(_tokenId: string): void {
    // No-op stub
  }

  connect(): void {
    this.connected = true;
    logger.debug('OrderBookStream stub connected', 'OrderBookStream');
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
