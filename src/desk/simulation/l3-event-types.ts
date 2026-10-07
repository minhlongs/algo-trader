/**
 * Level-3 Market Data Event Definitions
 * ITCH/Ouch style discrete order event contracts.
 *
 * @module desk/simulation/l3-event-types
 */

export type L3Side = 'BID' | 'ASK';
export type L3Action = 'ADD' | 'CANCEL' | 'MODIFY' | 'EXECUTE';

export interface L3MarketEvent {
  readonly eventId: string;
  readonly orderId: string;
  readonly timestampNs: bigint;
  readonly action: L3Action;
  readonly side: L3Side;
  readonly price: number;
  readonly size: number;
  readonly newPrice?: number;
  readonly newSize?: number;
}

export interface L3BookLevel {
  readonly price: number;
  readonly totalSize: number;
  readonly orderCount: number;
}

export interface L3BookSnapshot {
  readonly timestampNs: bigint;
  readonly bids: readonly L3BookLevel[];
  readonly asks: readonly L3BookLevel[];
  readonly bestBid?: number;
  readonly bestAsk?: number;
  readonly midPrice?: number;
  readonly spread?: number;
}

export interface L3ExecutionReport {
  readonly matchEventId: string;
  readonly passiveOrderId: string;
  readonly aggressorSide: L3Side;
  readonly price: number;
  readonly executedSize: number;
  readonly timestampNs: bigint;
  readonly remainingSize: number;
}
