/**
 * Source labels for every point-in-time and retroactive Polymarket data row.
 *
 * - `recorded-l2`    : captured live from the CLOB market WebSocket by `l2-recorder`.
 * - `data-api-v2`    : retroactive trades / positions from https://data-api.polymarket.com/v2.
 * - `prices-history` : retroactive price points from https://clob.polymarket.com/prices-history.
 *
 * This file is the single source of truth for those three strings. Downstream KPI code
 * must reject any row whose label is outside this union, so a synthetic price path can
 * never be presented as observed market data.
 */

export const L2_SOURCE_LABELS = ['recorded-l2', 'data-api-v2', 'prices-history'] as const;

export type L2SourceLabel = (typeof L2_SOURCE_LABELS)[number];

export const L2_SOURCE_RECORDED = 'recorded-l2' as const;
export const L2_SOURCE_DATA_API_V2 = 'data-api-v2' as const;
export const L2_SOURCE_PRICES_HISTORY = 'prices-history' as const;

/** Type guard used by loaders and the KPI layer before trusting a row. */
export function isL2SourceLabel(value: unknown): value is L2SourceLabel {
  return typeof value === 'string' && (L2_SOURCE_LABELS as readonly string[]).includes(value);
}

/** Throw unless `value` is one of the three known labels. */
export function assertL2SourceLabel(value: unknown): asserts value is L2SourceLabel {
  if (!isL2SourceLabel(value)) {
    throw new Error(`Unknown data source label: ${JSON.stringify(value)}`);
  }
}

// ─── Retroactive rows (real history, not self-recorded) ───────────────────────

export interface DataApiV2TradeRow {
  source: 'data-api-v2';
  /** Epoch milliseconds. */
  t: number;
  conditionId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  outcome: string;
  title: string;
  slug: string;
  wallet: string;
  transactionHash: string;
}

export type DataApiV2TradeRowInput = Omit<DataApiV2TradeRow, 'source'>;

export function makeDataApiV2TradeRow(input: DataApiV2TradeRowInput): DataApiV2TradeRow {
  return { source: L2_SOURCE_DATA_API_V2, ...input };
}

export interface PricesHistoryRow {
  source: 'prices-history';
  /** Epoch milliseconds. */
  t: number;
  tokenId: string;
  price: number;
}

export type PricesHistoryRowInput = Omit<PricesHistoryRow, 'source'>;

export function makePricesHistoryRow(input: PricesHistoryRowInput): PricesHistoryRow {
  return { source: L2_SOURCE_PRICES_HISTORY, ...input };
}
