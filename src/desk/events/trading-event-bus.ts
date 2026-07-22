/**
 * TradingEventBus — Singleton EventEmitter for broadcasting market and system events.
 *
 * Provides strongly-typed event payloads for type-safe subscription and emission.
 * Extends Node.js EventEmitter for maximum compatibility.
 */
import { EventEmitter } from 'events';

// ─── Event Type Definitions ────────────────────────────────────────────────────
export type TradingEventType =
  | 'PRICE_UPDATE'
  | 'SIGNAL_GENERATED'
  | 'ORDER_STATUS_CHANGE'
  | 'SYSTEM_ALERT'
  | 'CONNECTION_STATUS';

export interface PriceUpdatePayload {
  tokenId: string;
  bid: number;
  ask: number;
  timestamp: number;
  spread?: number;
  spreadBps?: number;
}

export interface SignalGeneratedPayload {
  signalId: string;
  strategyName: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  confidence: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface OrderStatusChangePayload {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  oldStatus: string;
  newStatus: string;
  timestamp: number;
}

export interface SystemAlertPayload {
  level: 'info' | 'warn' | 'error' | 'critical';
  component: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ConnectionStatusPayload {
  component: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  timestamp: number;
  error?: string;
  retryAttempt?: number;
  nextRetryMs?: number;
}

export type TradingEventPayload =
  | PriceUpdatePayload
  | SignalGeneratedPayload
  | OrderStatusChangePayload
  | SystemAlertPayload
  | ConnectionStatusPayload;

// ─── Type Guards for Event Payloads ──────────────────────────────────────────
export function isPriceUpdate(payload: TradingEventPayload): payload is PriceUpdatePayload {
  return 'bid' in payload && 'ask' in payload && 'tokenId' in payload;
}

export function isSignalGenerated(payload: TradingEventPayload): payload is SignalGeneratedPayload {
  return 'signalId' in payload && 'strategyName' in payload;
}

export function isOrderStatusChange(payload: TradingEventPayload): payload is OrderStatusChangePayload {
  return 'orderId' in payload && 'oldStatus' in payload && 'newStatus' in payload;
}

export function isSystemAlert(payload: TradingEventPayload): payload is SystemAlertPayload {
  return 'level' in payload && 'component' in payload && 'message' in payload;
}

export function isConnectionStatus(payload: TradingEventPayload): payload is ConnectionStatusPayload {
  return 'component' in payload && 'status' in payload && 'error' in payload;
}

// ─── Event Map for Type-Safe Emission ─────────────────────────────────────────
// Node.js EventEmitter expects EventMap values to be arrays of arguments
export interface TradingEventMap {
  PRICE_UPDATE: [PriceUpdatePayload];
  SIGNAL_GENERATED: [SignalGeneratedPayload];
  ORDER_STATUS_CHANGE: [OrderStatusChangePayload];
  SYSTEM_ALERT: [SystemAlertPayload];
  CONNECTION_STATUS: [ConnectionStatusPayload];
}

// ─── TradingEventBus Class ───────────────────────────────────────────────────
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