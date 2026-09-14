import type {
  TradingEventPayload,
  PriceUpdatePayload,
  SignalGeneratedPayload,
  OrderStatusChangePayload,
  SystemAlertPayload,
  ConnectionStatusPayload,
} from './trading-event-bus-types';

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
