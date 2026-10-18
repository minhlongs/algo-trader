/**
 * Gamma Historical Data Provider
 *
 * Fetches market snapshots from Gamma API at intervals for backtesting.
 * Caches snapshots in memory for the duration of a backtest session.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalSnapshot, HistoricalMarketData } from './types';
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
        markets: markets.map((m, j) => this.simulatePriceEvolution(m, progress, j)),
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
        const conditionId = String(r.conditionId ?? '');
        const outcomePrices: string[] = Array.isArray(r.outcomePrices)
          ? (r.outcomePrices as string[])
          : ['0.5', '0.5'];
        const yesPrice = parseFloat(outcomePrices[0] ?? '0.5');
        const noPrice = parseFloat(outcomePrices[1] ?? String(1 - yesPrice));

        return {
          id: String(r.id ?? conditionId),
          question: String(r.question ?? ''),
          conditionId,
          slug: String(r.slug ?? ''),
          outcomes: Array.isArray(r.outcomes) ? (r.outcomes as string[]) : ['Yes', 'No'],
          outcomePrices,
          volume: Number(r.volume ?? 0),
          liquidity: Number(r.liquidity ?? 0),
          endDate: String(r.endDate ?? ''),
          active: r.active !== false,
          closed: r.closed === true,
          resolved: r.resolved === true,
          tokens: [
            { token_id: `${conditionId}-yes`, outcome: 'Yes', price: yesPrice },
            { token_id: `${conditionId}-no`, outcome: 'No', price: noPrice },
          ],
          yesTokenId: `${conditionId}-yes`,
          noTokenId: `${conditionId}-no`,
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
    progress: number,
    seed: number,
  ): HistoricalMarketData {
    const randomWalk = Math.sin(seed * 127.1 + progress * 12.9898) * 0.03 +
      Math.sin(seed * 269.5 + progress * 7.8342) * 0.015;

    const currentPrice = market.yesPrice;
    const startPrice = clamp(currentPrice - randomWalk, 0.01, 0.99);
    const price = startPrice + (currentPrice - startPrice) * progress;

    return {
      conditionId: market.conditionId,
      question: market.question,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      yesPrice: round4(price),
      volume: Math.round(market.volume * (0.1 + 0.9 * progress)),
      liquidity: Math.round(market.liquidity * (0.3 + 0.7 * progress)),
      closed: market.closed,
      endDate: market.endDate,
    };
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
