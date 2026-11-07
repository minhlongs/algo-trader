/**
 * Gamma Historical Data Provider
 *
 * Fetches market snapshots from Gamma API at intervals for backtesting.
 * Caches snapshots in memory for the duration of a backtest session.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalSnapshot, HistoricalMarketData } from './types';
import { parseJsonStringArray, simulateMarketRegimeTick } from './backtest-price-regimes';
import { logger } from '../../shared/utils/logger';

export class GammaHistoricalProvider {
  private baseUrl = 'https://gamma-api.polymarket.com';
  private cache: Map<string, HistoricalSnapshot[]> = new Map();

  /**
   * Fetch a time-series of market snapshots for backtesting.
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
    const maxTicks = Math.min(tickCount, 168);

    logger.info('Fetching historical market snapshots', 'GammaHistoricalProvider', {
      days,
      intervalMs,
      tickCount: maxTicks,
    });

    const markets = await this.fetchCurrentMarkets();
    if (markets.length === 0) {
      throw new Error('GammaHistoricalProvider: failed to fetch any markets — backtest aborted');
    }

    const snapshots: HistoricalSnapshot[] = [];
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    for (let i = 0; i < maxTicks; i++) {
      const progress = i / (maxTicks - 1 || 1);
      const timestamp = new Date(startTime + progress * (now - startTime)).toISOString();

      snapshots.push({
        timestamp,
        markets: markets.map((m, j) => this.simulatePriceEvolution(m, i, maxTicks, j)),
      });
    }

    this.cache.set(cacheKey, snapshots);
    return snapshots;
  }

  /** Clear cache between backtest runs */
  clearCache(): void {
    this.cache.clear();
  }

  private async fetchCurrentMarkets(): Promise<GammaMarket[]> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/markets?closed=false&limit=100`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!resp.ok) throw new Error(`Gamma API error ${resp.status}`);
      const raw: Array<Record<string, unknown>> = await resp.json();

      return raw.map((r) => {
        const conditionId = String(r.conditionId ?? r.id ?? '');
        const parsedPrices = parseJsonStringArray(r.outcomePrices);
        const outcomePrices = parsedPrices.length >= 2 ? parsedPrices : ['0.5', '0.5'];
        const parsedOutcomes = parseJsonStringArray(r.outcomes);
        const outcomes = parsedOutcomes.length >= 2 ? parsedOutcomes : ['Yes', 'No'];
        const clobTokenIds = parseJsonStringArray(r.clobTokenIds);
        const yesPrice = parseFloat(outcomePrices[0] ?? '0.5') || 0.5;
        const noPrice = parseFloat(outcomePrices[1] ?? String(1 - yesPrice)) || 1 - yesPrice;
        const yesTokenId = clobTokenIds[0] ?? `${conditionId}-yes`;
        const noTokenId = clobTokenIds[1] ?? `${conditionId}-no`;

        return {
          id: String(r.id ?? conditionId),
          question: String(r.question ?? ''),
          conditionId,
          slug: String(r.slug ?? ''),
          outcomes,
          outcomePrices,
          volume: Number(r.volumeNum ?? r.volume ?? 0),
          liquidity: Number(r.liquidityNum ?? r.liquidity ?? 0),
          endDate: String(r.end_date_iso ?? r.endDate ?? ''),
          active: r.active !== false,
          closed: r.closed === true,
          resolved: r.resolved === true,
          tokens: [
            { token_id: yesTokenId, outcome: outcomes[0] ?? 'Yes', price: yesPrice },
            { token_id: noTokenId, outcome: outcomes[1] ?? 'No', price: noPrice },
          ],
          yesTokenId,
          noTokenId,
          yesPrice,
        };
      });
    } catch (err) {
      logger.error('Failed to fetch Gamma markets', 'GammaHistoricalProvider', {
        err: String(err),
      });
      return [];
    }
  }

  private simulatePriceEvolution(
    market: GammaMarket,
    tickIdx: number,
    totalTicks: number,
    marketIdx: number,
  ): HistoricalMarketData {
    return simulateMarketRegimeTick(market, tickIdx, totalTicks, marketIdx);
  }
}
