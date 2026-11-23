/**
 * POLY-G5 Public Beta — Read-Only Polymarket Market Feed with Source Timestamps
 * and Hard 5-Minute Crypto Exclusion (`classifyFiveMinuteExclusion`).
 *
 * Gamma supplies the market universe; per-token top-of-book quotes come from the
 * public CLOB `/books` endpoint because Gamma's `updatedAt` is a feed-level stamp
 * served behind `max-age=300` and can never satisfy a 30s freshness gate. Feeds
 * fail closed on stale or missing quotes (`> MARKET_STALENESS_LIMIT_MS`).
 */

import {
  isMarketDataEnabled,
  MARKET_DATA_DISABLED_REASON,
  MARKET_STALENESS_LIMIT_MS,
  type PolyBetaEnv,
  type PolyBetaMarketSnapshot,
} from './poly-beta-types';
import { readMarketNegativeCache, writeMarketNegativeCache } from './poly-beta-request-guards';
import {
  fetchClobTopOfBookQuotes,
  resolveClobBaseUrl,
  type BetaTopOfBookQuote,
} from './poly-beta-market-quotes';
import {
  buildMarketSnapshots,
  collectGammaCandidates,
  type GammaMarketCandidate,
} from './poly-beta-market-normalization';

const MARKET_CACHE_KEY = 'markets:public:v1';
const MARKET_CACHE_TTL_SEC = 60; // Cloudflare KV minimum expirationTtl is 60s; freshness still checked at <=30s
const MAX_FEED_MARKETS = 12;

async function resolveClobQuotes(
  doFetch: typeof fetch,
  env: PolyBetaEnv,
  candidates: readonly GammaMarketCandidate[],
): Promise<Map<string, BetaTopOfBookQuote>> {
  try {
    return await fetchClobTopOfBookQuotes(
      doFetch,
      resolveClobBaseUrl(env.POLYMARKET_PUBLIC_CLOB_URL),
      candidates.map((c) => c.yesTokenId),
    );
  } catch {
    return new Map();
  }
}

/**
 * Side-effect-free health status probe for market feeds.
 * NEVER invokes `fetch()`, NEVER writes to KV, and skips KV reads completely
 * when `MARKET_DATA_ENABLED` is not explicitly `"true"`.
 */
export async function readBetaMarketHealthStatus(
  env: PolyBetaEnv,
  nowMs = Date.now(),
): Promise<{
  marketDataEnabled: boolean;
  feedHealthy: boolean;
  supportedMarketCount: number;
  disabledReason: string | null;
}> {
  if (!isMarketDataEnabled(env)) {
    return {
      marketDataEnabled: false,
      feedHealthy: false,
      supportedMarketCount: 0,
      disabledReason: MARKET_DATA_DISABLED_REASON,
    };
  }
  const cachedRaw = await env.POLY_BETA_KV.get(MARKET_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as PolyBetaMarketSnapshot[];
      if (
        Array.isArray(cached) &&
        cached.length > 0 &&
        cached.every((m) => isMarketSnapshotFresh(m, nowMs).fresh)
      ) {
        return {
          marketDataEnabled: true,
          feedHealthy: true,
          supportedMarketCount: cached.length,
          disabledReason: null,
        };
      }
    } catch {
      // Malformed cache -> report unhealthy without outbound fetch
    }
  }
  return {
    marketDataEnabled: true,
    feedHealthy: false,
    supportedMarketCount: 0,
    disabledReason: 'MARKET_CACHE_EMPTY_OR_STALE',
  };
}

export async function fetchSupportedBetaMarkets(
  env: PolyBetaEnv,
  options: { fetchImpl?: typeof fetch; nowMs?: number } = {},
): Promise<{
  markets: PolyBetaMarketSnapshot[];
  feedHealthy: boolean;
  staleReason: string | null;
  marketDataEnabled: boolean;
}> {
  // Default-deny guard: execute BEFORE any KV cache read or outbound fetch().
  if (!isMarketDataEnabled(env)) {
    return {
      markets: [],
      feedHealthy: false,
      staleReason: MARKET_DATA_DISABLED_REASON,
      marketDataEnabled: false,
    };
  }

  const nowMs = options.nowMs ?? Date.now();
  const cachedRaw = await env.POLY_BETA_KV.get(MARKET_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as PolyBetaMarketSnapshot[];
      if (
        Array.isArray(cached) &&
        cached.length > 0 &&
        cached.every((m) => isMarketSnapshotFresh(m, nowMs).fresh)
      ) {
        return { markets: cached, feedHealthy: true, staleReason: null, marketDataEnabled: true };
      }
    } catch {
      // Fall through to live fetch
    }
  }

  const negReason = await readMarketNegativeCache(env, nowMs);
  if (negReason && !options.fetchImpl) {
    return { markets: [], feedHealthy: false, staleReason: negReason, marketDataEnabled: true };
  }

  const baseUrl = (
    env.POLYMARKET_PUBLIC_GAMMA_URL || 'https://gamma-api.polymarket.com'
  ).replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;

  try {
    const res = await doFetch(
      `${baseUrl}/markets?active=true&closed=false&limit=25`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      const reason = `Upstream market feed returned HTTP ${res.status}`;
      await writeMarketNegativeCache(env, reason, nowMs);
      return { markets: [], feedHealthy: false, staleReason: reason, marketDataEnabled: true };
    }
    const payload = (await res.json()) as unknown;
    const list = Array.isArray(payload) ? payload : [];
    const candidates = collectGammaCandidates(list, MAX_FEED_MARKETS);
    const quotes = await resolveClobQuotes(doFetch, env, candidates);
    const normalized = buildMarketSnapshots(candidates, quotes, nowMs);
    const freshMarkets = normalized.filter((m) => isMarketSnapshotFresh(m, nowMs).fresh);
    if (freshMarkets.length === 0) {
      const reason =
        normalized.length > 0
          ? 'Upstream market quotes are stale (>30s)'
          : 'No eligible non-5m markets returned by upstream feed';
      await writeMarketNegativeCache(env, reason, nowMs);
      return { markets: [], feedHealthy: false, staleReason: reason, marketDataEnabled: true };
    }
    await env.POLY_BETA_KV.put(MARKET_CACHE_KEY, JSON.stringify(freshMarkets), {
      expirationTtl: MARKET_CACHE_TTL_SEC,
    });
    return { markets: freshMarkets, feedHealthy: true, staleReason: null, marketDataEnabled: true };
  } catch {
    const reason = 'Upstream market fetch failed';
    await writeMarketNegativeCache(env, reason, nowMs).catch(() => {});
    return { markets: [], feedHealthy: false, staleReason: reason, marketDataEnabled: true };
  }
}

export function isMarketSnapshotFresh(
  market: PolyBetaMarketSnapshot,
  nowMs: number,
): { fresh: boolean; ageMs: number } {
  const ts = market.sourceTimestampMs;
  if (!Number.isFinite(ts) || ts <= 0 || ts > nowMs + 5_000) {
    return { fresh: false, ageMs: Number.POSITIVE_INFINITY };
  }
  const ageMs = Math.max(0, nowMs - ts);
  return { fresh: ageMs <= MARKET_STALENESS_LIMIT_MS, ageMs };
}
