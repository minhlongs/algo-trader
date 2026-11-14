/**
 * Gamma Historical Data Provider
 *
 * Fetches active Polymarket markets from Gamma API, then pulls each market's
 * real retroactive CLOB `prices-history` series via `PolymarketDataApiClient`.
 * Every emitted snapshot and market row carries `source: 'prices-history'`.
 *
 * Synthetic price paths (`simulateMarketRegimeTick`) are NOT called here.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import {
  createPolymarketDataApiClient,
  type PolymarketDataApiClient,
} from '../polymarket/polymarket-data-api-client';
import type { PricesHistoryRow } from '../polymarket/l2/l2-source-labels';
import type { HistoricalSnapshot } from './types';
import { buildAlignedSnapshots, parseGammaMarketRow } from './gamma-historical-snapshot-aligner';
import { logger } from '../../shared/utils/logger';

const MAX_HISTORY_MARKETS = 20;
const MAX_TICKS = 168;

export interface GammaHistoricalProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  dataApiClient?: PolymarketDataApiClient;
  /** Maximum markets queried against `/prices-history` per run (default 20). */
  maxMarkets?: number;
}

export class GammaHistoricalProvider {
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly injectedDataClient?: PolymarketDataApiClient;
  private readonly maxMarkets: number;
  private readonly cache: Map<string, HistoricalSnapshot[]> = new Map();

  constructor(options: GammaHistoricalProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://gamma-api.polymarket.com';
    this.fetchImpl = options.fetchImpl;
    this.injectedDataClient = options.dataApiClient;
    this.maxMarkets = options.maxMarkets ?? MAX_HISTORY_MARKETS;
  }

  /**
   * Fetch a time-series of real retroactive market snapshots for backtesting.
   *
   * @param days Number of days of data
   * @param intervalMs Tick interval (default: 1 hour)
   */
  async fetchHistoricalSnapshots(
    days: number,
    intervalMs = 3_600_000,
  ): Promise<HistoricalSnapshot[]> {
    const cacheKey = `${days}-${intervalMs}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const tickCount = Math.ceil((days * 24 * 60 * 60 * 1000) / intervalMs);
    const maxTicks = Math.min(Math.max(1, tickCount), MAX_TICKS);

    logger.info('Fetching historical market snapshots', 'GammaHistoricalProvider', {
      days,
      intervalMs,
      tickCount: maxTicks,
    });

    const markets = await this.fetchCurrentMarkets();
    if (markets.length === 0) {
      throw new Error('GammaHistoricalProvider: failed to fetch any markets — backtest aborted');
    }

    const candidates = markets.slice(0, this.maxMarkets);
    const interval = days <= 1 ? '1d' : days <= 7 ? '1w' : 'max';
    const fidelity = Math.max(1, Math.round(intervalMs / 60_000));
    const dataClient =
      this.injectedDataClient ??
      createPolymarketDataApiClient({ fetchImpl: this.resolveFetch() });

    const seriesByMarket = await Promise.all(
      candidates.map(async (market) => ({
        market,
        rows: await this.fetchMarketHistory(dataClient, market, interval, fidelity),
      })),
    );
    const observed = seriesByMarket.filter((entry) => entry.rows.length > 0);
    if (observed.length === 0) {
      throw new Error(
        'GammaHistoricalProvider: failed to fetch real prices-history for any market — backtest aborted',
      );
    }

    const snapshots = buildAlignedSnapshots(observed, days, maxTicks);
    this.cache.set(cacheKey, snapshots);
    return snapshots;
  }

  /** Clear cache between backtest runs. */
  clearCache(): void {
    this.cache.clear();
  }

  private resolveFetch(): typeof fetch {
    return this.fetchImpl ?? globalThis.fetch;
  }

  private async fetchMarketHistory(
    dataClient: PolymarketDataApiClient,
    market: GammaMarket,
    interval: string,
    fidelity: number,
  ): Promise<PricesHistoryRow[]> {
    const tokenId = market.yesTokenId;
    if (!tokenId) return [];
    try {
      return await dataClient.fetchPricesHistory({ tokenId, interval, fidelity });
    } catch (err) {
      logger.warn('Failed to fetch prices-history for market', 'GammaHistoricalProvider', {
        conditionId: market.conditionId,
        tokenId,
        err: String(err),
      });
      return [];
    }
  }

  private async fetchCurrentMarkets(): Promise<GammaMarket[]> {
    try {
      const resp = await this.resolveFetch()(
        `${this.baseUrl}/markets?closed=false&limit=100`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!resp.ok) throw new Error(`Gamma API error ${resp.status}`);
      const raw: Array<Record<string, unknown>> = await resp.json();
      return raw.map(parseGammaMarketRow);
    } catch (err) {
      logger.error('Failed to fetch Gamma markets', 'GammaHistoricalProvider', {
        err: String(err),
      });
      return [];
    }
  }
}
