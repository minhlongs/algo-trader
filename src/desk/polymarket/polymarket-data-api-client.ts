/**
 * Typed client for Polymarket's real (retroactive) market data.
 *
 * Endpoints — verified live 2026-11-12, do not "improve" from memory:
 * - Data API v2 trades:  GET https://data-api.polymarket.com/v2/trades?condition=<conditionId>
 *                        (filter by wallet with `user=`; `offset=` is rejected — pages are cursor-only)
 * - CLOB prices history: GET https://clob.polymarket.com/prices-history?market=<tokenId>&interval=..&fidelity=..
 * - Data API v2 positions: GET https://data-api.polymarket.com/v2/positions?user=<wallet>
 *
 * The v1 `/trades` and `/positions` routes are RETIRED (HTTP 410) and must not be called.
 *
 * Every parsed row carries a `source` label from `l2/l2-source-labels` so the KPI layer
 * can tell retroactive data from self-recorded L2 data.
 */

import {
  makeDataApiV2TradeRow,
  makePricesHistoryRow,
  type DataApiV2TradeRow,
  type PricesHistoryRow,
} from './l2/l2-source-labels';
import {
  positionSchema,
  positionsEnvelopeSchema,
  pricesHistorySchema,
  tradeSchema,
  tradesEnvelopeSchema,
} from './polymarket-data-api-schemas';

export const DATA_API_BASE = 'https://data-api.polymarket.com';
export const CLOB_BASE = 'https://clob.polymarket.com';

export class PolymarketDataApiError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(url: string, status: number, body: string) {
    super(`Polymarket data request failed: HTTP ${status} for ${url} — ${body.slice(0, 500)}`);
    this.name = 'PolymarketDataApiError';
    this.url = url;
    this.status = status;
    this.body = body;
  }
}

export interface PolymarketDataApiClientOptions {
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Defaults to 15 s. */
  timeoutMs?: number;
}

export interface FetchTradesParams {
  /** Market condition id. Omit to query by wallet alone (the API accepts either filter). */
  conditionId?: string;
  /** Optional wallet filter (`user=`); `proxy_wallet=` is silently ignored by the API. */
  wallet?: string;
  limit?: number;
  cursor?: string;
}

export interface FetchTradesResult {
  trades: DataApiV2TradeRow[];
  nextCursor: string | null;
}

export interface FetchPricesHistoryParams {
  tokenId: string;
  /** CLOB interval, e.g. `1d`, `1w`, `max`. Defaults to `1d`. */
  interval?: string;
  /** Resolution in minutes. Defaults to `1`. */
  fidelity?: number;
}

export interface RealPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface PolymarketDataApiClient {
  fetchTrades(params: FetchTradesParams): Promise<FetchTradesResult>;
  fetchPricesHistory(params: FetchPricesHistoryParams): Promise<PricesHistoryRow[]>;
  fetchPositions(wallet: string): Promise<RealPosition[]>;
}

function buildTradesUrl(params: FetchTradesParams): string {
  const url = new URL(`${DATA_API_BASE}/v2/trades`);
  if (params.conditionId) url.searchParams.set('condition', params.conditionId);
  if (params.wallet) url.searchParams.set('user', params.wallet);
  url.searchParams.set('limit', String(params.limit ?? 100));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  return url.toString();
}

function buildPricesHistoryUrl(params: FetchPricesHistoryParams): string {
  const url = new URL(`${CLOB_BASE}/prices-history`);
  url.searchParams.set('market', params.tokenId);
  url.searchParams.set('interval', params.interval ?? '1d');
  url.searchParams.set('fidelity', String(params.fidelity ?? 1));
  return url.toString();
}

function buildPositionsUrl(wallet: string): string {
  const url = new URL(`${DATA_API_BASE}/v2/positions`);
  url.searchParams.set('user', wallet);
  return url.toString();
}

export function createPolymarketDataApiClient(options: PolymarketDataApiClientOptions = {}): PolymarketDataApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function getJson(url: string): Promise<unknown> {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    if (!response.ok) throw new PolymarketDataApiError(url, response.status, body);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`Polymarket data response was not JSON: ${url}`);
    }
  }

  return {
    async fetchTrades(params: FetchTradesParams): Promise<FetchTradesResult> {
      const envelope = tradesEnvelopeSchema.safeParse(await getJson(buildTradesUrl(params)));
      if (!envelope.success) throw new Error(`Unexpected v2/trades payload: ${envelope.error.message}`);

      const trades: DataApiV2TradeRow[] = [];
      for (const raw of envelope.data.data) {
        const parsed = tradeSchema.safeParse(raw);
        if (!parsed.success) continue;
        const trade = parsed.data;
        trades.push(
          makeDataApiV2TradeRow({
            t: trade.timestamp * 1000,
            conditionId: trade.condition_id,
            tokenId: trade.token_id,
            side: trade.side === 'SELL' ? 'SELL' : 'BUY',
            price: trade.price,
            size: trade.size,
            outcome: trade.outcome,
            title: trade.title,
            slug: trade.slug,
            wallet: trade.proxy_wallet,
            transactionHash: trade.transaction_hash,
          }),
        );
      }

      return { trades, nextCursor: envelope.data.pagination?.next_cursor ?? null };
    },

    async fetchPricesHistory(params: FetchPricesHistoryParams): Promise<PricesHistoryRow[]> {
      const parsed = pricesHistorySchema.safeParse(await getJson(buildPricesHistoryUrl(params)));
      if (!parsed.success) throw new Error(`Unexpected prices-history payload: ${parsed.error.message}`);
      return parsed.data.history
        .map((point) => makePricesHistoryRow({ t: point.t * 1000, tokenId: params.tokenId, price: point.p }))
        .sort((a, b) => a.t - b.t);
    },

    async fetchPositions(wallet: string): Promise<RealPosition[]> {
      const envelope = positionsEnvelopeSchema.safeParse(await getJson(buildPositionsUrl(wallet)));
      if (!envelope.success) throw new Error(`Unexpected v2/positions payload: ${envelope.error.message}`);

      const positions: RealPosition[] = [];
      for (const raw of envelope.data.data) {
        const parsed = positionSchema.safeParse(raw);
        if (!parsed.success) continue;
        const position = parsed.data;
        positions.push({
          conditionId: position.condition_id,
          title: position.title,
          outcome: position.outcome,
          size: position.current_size,
          avgPrice: position.avg_price,
          currentPrice: position.current_price,
          unrealizedPnl: position.unrealized_pnl,
        });
      }
      return positions;
    },
  };
}
