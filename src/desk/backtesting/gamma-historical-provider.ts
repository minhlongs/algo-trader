/**
 * Gamma Historical Data Provider
 *
 * Fetches market snapshots from Gamma API at intervals for backtesting.
 * Caches snapshots in memory for the duration of a backtest session.
 *
 * Limitation: Gamma API only provides current snapshot, not true historical
 * time-series. For MVP backtesting, we fetch multiple snapshots over time
 * and simulate price evolution. For production, replace with a proper
 * historical data store (TimescaleDB or S3 archive).
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import type { HistoricalSnapshot, HistoricalMarketData } from './types';
import { logger } from '../../shared/utils/logger';

// ── Provider ───────────────────────────────────────────────────────────────────

export class GammaHistoricalProvider {
  private baseUrl = 'https://gamma-api.polymarket.com';
  private cache: Map<string, HistoricalSnapshot[]> = new Map();

  /**
   * Fetch a time-series of market snapshots for backtesting.
   *
   * Strategy: fetch current snapshot as the "latest" data point,
   * then generate synthetic historical snapshots with slight variations
   * for backtesting purposes. Real historical data would require
   * a dedicated archive.
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
    const maxTicks = Math.min(tickCount, 168); // Cap at 1 week of hourly data

    logger.info('Fetching historical market snapshots', 'GammaHistoricalProvider', {
      days,
      intervalMs,
      tickCount: maxTicks,
    });

    // Fetch current markets as base
    const markets = await this.fetchCurrentMarkets();
    if (markets.length === 0) {
      throw new Error('GammaHistoricalProvider: failed to fetch any markets — backtest aborted');
    }

    // Generate synthetic historical snapshots from current data
    // Each snapshot perturbs prices slightly to simulate market movement
    const snapshots: HistoricalSnapshot[] = [];
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    for (let i = 0; i < maxTicks; i++) {
      const progress = i / (maxTicks - 1 || 1); // 0 → 1
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

  // ── Private ─────────────────────────────────────────────────────────────────

  private async fetchCurrentMarkets(): Promise<GammaMarket[]> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/markets?closed=false&limit=100`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!resp.ok) throw new Error(`Gamma API error ${resp.status}`);
      return (await resp.json()) as GammaMarket[];
    } catch (err) {
      logger.error('Failed to fetch Gamma markets', 'GammaHistoricalProvider', {
        err: String(err),
      });
      return [];
    }
  }

  /**
   * Simulate price evolution from historical start to current.
   * Uses deterministic random walk based on market index + progress.
   */
  private simulatePriceEvolution(
    market: GammaMarket,
    progress: number, // 0 = start of period, 1 = now
    seed: number,
  ): HistoricalMarketData {
    // Deterministic pseudo-random from seed + progress
    const randomWalk = Math.sin(seed * 127.1 + progress * 12.9898) * 0.03 +
      Math.sin(seed * 269.5 + progress * 7.8342) * 0.015;

    const currentPrice = market.yesPrice;
    // Start price drifted from current by random walk
    const startPrice = clamp(currentPrice - randomWalk, 0.01, 0.99);
    // Interpolate between start and current
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
