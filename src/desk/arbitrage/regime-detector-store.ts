/**
 * Regime Detector Redis Store
 * Historical spreads retrieval and regime metrics snapshot storage
 */

import type { RedisClientType } from '../../redis';
import type { RegimeMetrics } from './regime-detector-types';

export async function fetchHistoricalSpreads(
  redis: RedisClientType,
  symbol: string,
  exchanges: string[],
  periods: number
): Promise<number[]> {
  const spreads: number[] = [];

  for (const exchange of exchanges) {
    const key = `ticker:${exchange}:${symbol}`;
    const ticker = await redis.hgetall(key);

    if (ticker && Object.keys(ticker).length > 0) {
      const bid = parseFloat(ticker.bid) || 0;
      const ask = parseFloat(ticker.ask) || 0;
      if (bid > 0 && ask > 0) {
        spreads.push(((ask - bid) / bid) * 100);
      }
    }
  }

  return spreads.slice(-periods);
}

export async function saveRegimeMetrics(
  redis: RedisClientType,
  symbol: string,
  metrics: RegimeMetrics
): Promise<void> {
  const key = `regime:${symbol}:${metrics.timestamp}`;
  const data = {
    regime: metrics.regime,
    volatility: metrics.volatility.toString(),
    spreadAvg: metrics.spreadAvg.toString(),
    spreadStdDev: metrics.spreadStdDev.toString(),
    volumeChange: metrics.volumeChange.toString(),
    confidence: metrics.confidence.toString(),
    timestamp: metrics.timestamp.toString(),
  };

  const pipeline = redis.pipeline();
  pipeline.hset(key, data);
  pipeline.expire(key, 3600);
  await pipeline.exec();
}
