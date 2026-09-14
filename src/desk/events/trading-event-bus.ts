/**
 * TradingEventBus — Singleton EventEmitter for broadcasting market and system events.
 *
 * Provides strongly-typed event payloads for type-safe subscription and emission.
 * Extends Node.js EventEmitter for maximum compatibility.
 */
import { EventEmitter } from 'events';
import type {
  TradingEventMap,
  PriceUpdatePayload,
  SignalGeneratedPayload,
  OrderStatusChangePayload,
  SystemAlertPayload,
  ConnectionStatusPayload,
} from './trading-event-bus-types';

export * from './trading-event-bus-types';
export * from './trading-event-bus-guards';

class TradingEventBus extends EventEmitter<TradingEventMap> {
  private static instance: TradingEventBus | null = null;
  private connectionStatusCache = new Map<string, ConnectionStatusPayload>();

  private constructor() {
    super();
    // Increase default max listeners to avoid warnings with many strategies
    this.setMaxListeners(100);
  }

  /** Get the singleton instance */
  static getInstance(): TradingEventBus {
    if (!TradingEventBus.instance) {
      TradingEventBus.instance = new TradingEventBus();
    }
    return TradingEventBus.instance;
  }

  /** Reset singleton (primarily for testing) */
  static resetInstance(): void {
    if (TradingEventBus.instance) {
      TradingEventBus.instance.removeAllListeners();
      TradingEventBus.instance = null;
    }
  }

  // ─── Type-Safe Emit Methods ────────────────────────────────────────────────

  emitPriceUpdate(payload: PriceUpdatePayload): void {
    this.emit('PRICE_UPDATE', payload);
  }

  emitSignalGenerated(payload: SignalGeneratedPayload): void {
    this.emit('SIGNAL_GENERATED', payload);
  }

  emitOrderStatusChange(payload: OrderStatusChangePayload): void {
    this.emit('ORDER_STATUS_CHANGE', payload);
  }

  emitSystemAlert(payload: SystemAlertPayload): void {
    this.emit('SYSTEM_ALERT', payload);
  }

  emitConnectionStatus(payload: ConnectionStatusPayload): void {
    // Cache latest connection status per component for late subscribers
    this.connectionStatusCache.set(payload.component, payload);
    this.emit('CONNECTION_STATUS', payload);
  }

  // ─── Type-Safe Subscription Helpers ────────────────────────────────────────

  onPriceUpdate(handler: (payload: PriceUpdatePayload) => void): () => void {
    this.on('PRICE_UPDATE', handler);
    return () => this.off('PRICE_UPDATE', handler);
  }

  onSignalGenerated(handler: (payload: SignalGeneratedPayload) => void): () => void {
    this.on('SIGNAL_GENERATED', handler);
    return () => this.off('SIGNAL_GENERATED', handler);
  }

  onOrderStatusChange(handler: (payload: OrderStatusChangePayload) => void): () => void {
    this.on('ORDER_STATUS_CHANGE', handler);
    return () => this.off('ORDER_STATUS_CHANGE', handler);
  }

  onSystemAlert(handler: (payload: SystemAlertPayload) => void): () => void {
    this.on('SYSTEM_ALERT', handler);
    return () => this.off('SYSTEM_ALERT', handler);
  }

  onConnectionStatus(handler: (payload: ConnectionStatusPayload) => void): () => void {
    this.on('CONNECTION_STATUS', handler);
    return () => this.off('CONNECTION_STATUS', handler);
  }

  // ─── Utility Methods ────────────────────────────────────────────────────────

  /** Get latest cached connection status for a component */
  getConnectionStatus(component: string): ConnectionStatusPayload | undefined {
    return this.connectionStatusCache.get(component);
  }

  /** Get all cached connection statuses */
  getAllConnectionStatuses(): ConnectionStatusPayload[] {
    return Array.from(this.connectionStatusCache.values());
  }

  /** Clear all listeners and cache */
  clear(): void {
    this.removeAllListeners();
    this.connectionStatusCache.clear();
  }
}

// ─── Export Singleton Instance ────────────────────────────────────────────────
export const tradingEventBus = TradingEventBus.getInstance();

// ─── Named Export for Type Imports ────────────────────────────────────────────
export type { TradingEventBus };
