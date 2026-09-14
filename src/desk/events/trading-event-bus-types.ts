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

export interface TradingEventMap {
  PRICE_UPDATE: [PriceUpdatePayload];
  SIGNAL_GENERATED: [SignalGeneratedPayload];
  ORDER_STATUS_CHANGE: [OrderStatusChangePayload];
  SYSTEM_ALERT: [SystemAlertPayload];
  CONNECTION_STATUS: [ConnectionStatusPayload];
}
