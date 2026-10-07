/**
 * Order Book Pressure Indicator Types
 *
 * Contracts for multi-level order book volume imbalance,
 * micro-price calculation, and short-term directional skew.
 *
 * @module desk/signal/orderbook-pressure-types
 */

export interface PriceLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface BookSnapshotForPressure {
  readonly marketId: string;
  readonly bids: readonly PriceLevel[];
  readonly asks: readonly PriceLevel[];
  readonly timestamp: number;
}

export type ImbalanceRegime = 'STRONG_BID_PRESSURE' | 'MILD_BID_PRESSURE' | 'BALANCED' | 'MILD_ASK_PRESSURE' | 'STRONG_ASK_PRESSURE';

export interface OrderBookPressureMetrics {
  readonly marketId: string;
  readonly microPrice: number;
  readonly midPrice: number;
  readonly topLevelImbalance: number; // in [-1, +1]
  readonly multiLevelImbalance: number; // decay-weighted across depth, in [-1, +1]
  readonly regime: ImbalanceRegime;
  readonly expectedTickDriftBps: number;
}
