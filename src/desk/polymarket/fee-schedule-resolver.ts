/**
 * Resolves a market's live fee schedule from the Gamma API.
 *
 * A market's fee schedule is a property of the market, not of a guessed
 * category, so every fill path that can reach a ledger must ask the venue.
 * Gamma exposes it per market:
 *
 *     GET /markets?clob_token_ids=<tokenId>&limit=1
 *     -> [{ "feesEnabled": true,
 *           "feeSchedule": { "exponent": 1, "rate": 0.07,
 *                            "takerOnly": true, "rebateRate": 0.20 } }]
 *
 * `resolve` returns `null` for markets the exchange does not charge, and
 * throws only when the schedule could not be retrieved — callers must treat a
 * throw as "unknown", never as "free".
 */

import type { PolymarketFeeSchedule } from './polymarket-fee-calculator';

export interface FeeScheduleResolver {
  /** `null` => the market is exempt (`feesEnabled: false`). Throws only on transport failure. */
  resolve(tokenId: string): Promise<PolymarketFeeSchedule | null>;
}

const DEFAULT_GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface GammaFeeScheduleResolverOptions {
  /** Cache lifetime per token id. Default 5 minutes. */
  ttlMs?: number;
  /** Override the fetch implementation (tests). */
  fetchImpl?: typeof fetch;
  /** Override the Gamma base URL. Defaults to `GAMMA_API_URL` or production. */
  baseUrl?: string;
  /** Per-request timeout. Default 8 seconds. */
  timeoutMs?: number;
}

interface CacheEntry {
  expiresAtMs: number;
  schedule: PolymarketFeeSchedule | null;
}

function parseFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * The API returns `feeSchedule` either as a JSON object or (older payloads) as
 * a JSON-encoded string. Both shapes carry the same four fields.
 */
function parseFeeSchedule(raw: unknown): PolymarketFeeSchedule | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const rate = parseFiniteNumber(obj['rate']);
  const exponent = obj['exponent'] === undefined ? 1 : parseFiniteNumber(obj['exponent']);
  const rebateRate = obj['rebateRate'] === undefined ? 0 : parseFiniteNumber(obj['rebateRate']);
  if (
    rate === null || rate < 0 ||
    exponent === null || exponent <= 0 ||
    rebateRate === null || rebateRate < 0 || rebateRate > 1
  ) {
    return null;
  }
  return {
    exponent,
    rate,
    takerOnly: obj['takerOnly'] === undefined ? true : Boolean(obj['takerOnly']),
    rebateRate,
  };
}

/** Pick the market whose `clobTokenIds` contains `tokenId`, else the first row. */
function selectMarket(payload: unknown, tokenId: string): Record<string, unknown> | null {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>)['data'])
      ? ((payload as Record<string, unknown>)['data'] as unknown[])
      : [];
  const markets = rows.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object',
  );
  if (markets.length === 0) return null;

  for (const market of markets) {
    const rawIds = market['clobTokenIds'];
    let ids: unknown = rawIds;
    if (typeof ids === 'string') {
      try {
        ids = JSON.parse(ids);
      } catch {
        ids = null;
      }
    }
    if (Array.isArray(ids) && ids.some((id) => String(id) === tokenId)) return market;
  }
  return markets[0] ?? null;
}

function extractSchedule(market: Record<string, unknown>): PolymarketFeeSchedule | null {
  if (market['feesEnabled'] === false) return null;
  const rawSchedule = market['feeSchedule'];
  const schedule = parseFeeSchedule(rawSchedule);
  if (schedule) return schedule;
  // `feesEnabled` true, or a non-null `feeSchedule` payload that failed to parse:
  // fail closed rather than silently treating corrupt metadata as fee-exempt.
  if (market['feesEnabled'] === true) {
    throw new Error('Gamma market has feesEnabled=true but no parsable feeSchedule');
  }
  if (rawSchedule !== undefined && rawSchedule !== null) {
    throw new Error('Gamma market has unparsable feeSchedule payload');
  }
  return null;
}

/**
 * Gamma-backed resolver with a per-token TTL cache. Concurrent lookups for the
 * same token share one request.
 */
export function createGammaFeeScheduleResolver(
  opts: GammaFeeScheduleResolverOptions = {},
): FeeScheduleResolver {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const baseUrl = (opts.baseUrl ?? process.env['GAMMA_API_URL'] ?? DEFAULT_GAMMA_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const timeoutMs = opts.timeoutMs ?? 8000;
  const doFetch = opts.fetchImpl ?? fetch;
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<PolymarketFeeSchedule | null>>();

  async function fetchSchedule(tokenId: string): Promise<PolymarketFeeSchedule | null> {
    const url = `${baseUrl}/markets?clob_token_ids=${encodeURIComponent(tokenId)}&limit=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let payload: unknown;
    try {
      const response = await doFetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Gamma fee schedule lookup failed: HTTP ${response.status} for ${url}`);
      }
      payload = await response.json();
    } finally {
      clearTimeout(timer);
    }
    const market = selectMarket(payload, tokenId);
    if (!market) {
      throw new Error(`Gamma returned no market for token ${tokenId}`);
    }
    return extractSchedule(market);
  }

  return {
    async resolve(tokenId: string): Promise<PolymarketFeeSchedule | null> {
      if (!tokenId) throw new Error('fee schedule resolve requires a token id');
      const cached = cache.get(tokenId);
      const now = Date.now();
      if (cached && cached.expiresAtMs > now) return cached.schedule;

      const pending = inflight.get(tokenId);
      if (pending) return pending;

      const request = fetchSchedule(tokenId)
        .then((schedule) => {
          cache.set(tokenId, { expiresAtMs: Date.now() + ttlMs, schedule });
          return schedule;
        })
        .finally(() => {
          inflight.delete(tokenId);
        });
      inflight.set(tokenId, request);
      return request;
    },
  };
}
