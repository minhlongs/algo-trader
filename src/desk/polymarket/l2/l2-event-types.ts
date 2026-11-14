/**
 * Row shapes for the point-in-time L2 log.
 *
 * Levels keep the exchange's string representation (`price`/`size` as sent) so a replay
 * reproduces the book bit-for-bit instead of a re-serialised float approximation.
 *
 * Two row kinds are recorded:
 * - `book`         : full snapshot; replaces the current book for `assetId`.
 * - `price_change` : delta; `bids`/`asks` hold the changed levels for that side.
 *                    A level with `size === '0'` removes that price.
 */

import type { L2SourceLabel } from './l2-source-labels';
import { L2_SOURCE_RECORDED } from './l2-source-labels';

export interface L2PriceLevel {
  price: string;
  size: string;
}

export type L2EventType = 'book' | 'price_change';

export interface RecordedL2Row {
  /** Epoch milliseconds, from the exchange event timestamp when present. */
  t: number;
  source: 'recorded-l2';
  assetId: string;
  eventType: L2EventType;
  bids: L2PriceLevel[];
  asks: L2PriceLevel[];
  /** Condition id of the market, when the feed supplied it. */
  market?: string;
  /** Exchange book hash, when supplied (snapshot integrity aid). */
  hash?: string;
  tickSize?: string;
  lastTradePrice?: string;
}

/** A book reconstructed by replay, in exchange order (descending price on both sides). */
export interface ReplayedL2Book {
  t: number;
  source: L2SourceLabel;
  assetId: string;
  eventType: L2EventType;
  bids: L2PriceLevel[];
  asks: L2PriceLevel[];
  tickSize?: string;
  lastTradePrice?: string;
}

/** Narrow an untrusted object (e.g. a parsed JSONL line) into a recorded row. */
export function isRecordedL2Row(value: unknown): value is RecordedL2Row {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<RecordedL2Row>;
  return (
    typeof row.t === 'number' &&
    row.source === L2_SOURCE_RECORDED &&
    typeof row.assetId === 'string' &&
    (row.eventType === 'book' || row.eventType === 'price_change') &&
    Array.isArray(row.bids) &&
    Array.isArray(row.asks)
  );
}
