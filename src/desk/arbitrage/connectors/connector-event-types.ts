/**
 * Exchange Connector Error Hierarchy & Secondary Event Types
 * Extracted from types.ts for single-responsibility modularization.
 */

export class ExchangeConnectorError extends Error {
  readonly exchange: string;
  readonly code: string;

  constructor(message: string, exchange: string, code = 'EXCHANGE_ERROR') {
    super(`[${exchange}] ${message}`);
    this.name = 'ExchangeConnectorError';
    this.exchange = exchange;
    this.code = code;
  }
}

export class OrderPlacementError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'ORDER_PLACEMENT_FAILED');
    this.name = 'OrderPlacementError';
  }
}

export class OrderCancellationError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'ORDER_CANCELLATION_FAILED');
    this.name = 'OrderCancellationError';
  }
}

export class OrderNotFoundError extends ExchangeConnectorError {
  constructor(orderId: string, exchange: string) {
    super(`Order ${orderId} not found`, exchange, 'ORDER_NOT_FOUND');
    this.name = 'OrderNotFoundError';
  }
}

export class InsufficientBalanceError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'INSUFFICIENT_BALANCE');
    this.name = 'InsufficientBalanceError';
  }
}

export class ExchangeRateLimitError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'RATE_LIMIT_EXCEEDED');
    this.name = 'ExchangeRateLimitError';
  }
}

/** Alias for RateLimitExceededError to satisfy dispatch requirements */
export class RateLimitExceededError extends ExchangeRateLimitError {}

export class ExchangeNetworkError extends ExchangeConnectorError {
  constructor(message: string, exchange: string) {
    super(message, exchange, 'NETWORK_ERROR');
    this.name = 'ExchangeNetworkError';
  }
}
