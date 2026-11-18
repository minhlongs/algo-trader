/**
 * POLY-G5 Public Beta — Top-of-Book Quote Sourcing.
 *
 * Gamma's `updatedAt` is a feed-level stamp served behind `max-age=300`, so it is
 * routinely minutes old and useless for a 30s freshness gate. Quotes therefore come
 * from the public CLOB `/books` endpoint, which is per-token and exchange-timestamped.
 * Gamma's own `bestBid`/`bestAsk` remain a fallback only when a token has no usable book.
 */

export interface BetaTopOfBookQuote {
  bestBid: number;
  bestAsk: number;
  timestampMs: number;
}

interface RawBookLevel {
  price?: number | string;
  size?: number | string;
}

interface RawBook {
  asset_id?: string;
  timestamp?: string | number;
  bids?: RawBookLevel[];
  asks?: RawBookLevel[];
}

/** CLOB `/books` accepts a batch of token ids; keep one request per feed refresh. */
const MAX_BOOK_BATCH = 60;

const GAMMA_CLOB_BASE_URL = 'https://clob.polymarket.com';

export function resolveClobBaseUrl(configured?: string): string {
  return (configured || GAMMA_CLOB_BASE_URL).replace(/\/+$/, '');
}

function collectLevelPrices(levels: RawBookLevel[] | undefined, pick: 'max' | 'min'): number | null {
  const prices: number[] = [];
  for (const level of levels ?? []) {
    const price = Number(level?.price);
    const size = Number(level?.size);
    if (!Number.isFinite(price) || price <= 0 || price >= 1) continue;
    if (!Number.isFinite(size) || size <= 0) continue;
    prices.push(price);
  }
  if (prices.length === 0) return null;
  return pick === 'max' ? Math.max(...prices) : Math.min(...prices);
}

/**
 * CLOB returns bids ascending and asks descending, so best bid is the highest bid
 * price and best ask is the lowest ask price — never `bids[0]` / `asks[0]`.
 */
export function parseClobBook(raw: unknown): BetaTopOfBookQuote | null {
  if (!raw || typeof raw !== 'object') return null;
  const book = raw as RawBook;
  const rawTimestamp = Number(book.timestamp);
  if (!Number.isFinite(rawTimestamp) || rawTimestamp <= 0) return null;
  // CLOB normally reports milliseconds, but tolerate a seconds-epoch switch rather
  // than letting every quote read as decades stale and fail the whole feed closed.
  const timestampMs = rawTimestamp < 1e11 ? rawTimestamp * 1_000 : rawTimestamp;
  const bidPrice = collectLevelPrices(book.bids, 'max');
  const askPrice = collectLevelPrices(book.asks, 'min');
  if (bidPrice === null || askPrice === null) return null;
  const bestBid = Number(bidPrice.toFixed(4));
  const bestAsk = Number(askPrice.toFixed(4));
  if (!(bestBid > 0 && bestBid < bestAsk && bestAsk < 1)) return null;
  return { bestBid, bestAsk, timestampMs };
}

export async function fetchClobTopOfBookQuotes(
  doFetch: typeof fetch,
  clobBaseUrl: string,
  tokenIds: readonly string[],
): Promise<Map<string, BetaTopOfBookQuote>> {
  const quotes = new Map<string, BetaTopOfBookQuote>();
  const unique = [...new Set(tokenIds.filter((id) => id.length > 0))].slice(0, MAX_BOOK_BATCH);
  if (unique.length === 0) return quotes;

  const res = await doFetch(`${clobBaseUrl}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(unique.map((token_id) => ({ token_id }))),
  });
  if (!res.ok) return quotes;

  const payload = (await res.json()) as unknown;
  if (!Array.isArray(payload)) return quotes;

  for (const entry of payload) {
    const assetId = String((entry as RawBook | null)?.asset_id ?? '');
    if (!assetId) continue;
    const quote = parseClobBook(entry);
    if (quote) quotes.set(assetId, quote);
  }
  return quotes;
}

/** Gamma fallback: use only its own real quote fields and its own `updatedAt`. */
export function resolveGammaTopOfBook(raw: {
  bestBid?: number | string;
  bestAsk?: number | string;
  updatedAt?: string;
}): BetaTopOfBookQuote | null {
  const bidRaw =
    raw.bestBid === undefined || raw.bestBid === null || raw.bestBid === ''
      ? Number.NaN
      : Number(raw.bestBid);
  const askRaw =
    raw.bestAsk === undefined || raw.bestAsk === null || raw.bestAsk === ''
      ? Number.NaN
      : Number(raw.bestAsk);
  if (!Number.isFinite(bidRaw) || !Number.isFinite(askRaw)) return null;
  const bestBid = Number(bidRaw.toFixed(4));
  const bestAsk = Number(askRaw.toFixed(4));
  if (!(bestBid > 0 && bestBid < bestAsk && bestAsk < 1)) return null;
  const parsedUpdated = raw.updatedAt ? Date.parse(raw.updatedAt) : Number.NaN;
  const timestampMs = Number.isFinite(parsedUpdated) && parsedUpdated > 0 ? parsedUpdated : 0;
  return { bestBid, bestAsk, timestampMs };
}
