/**
 * Spread Detector Persistence
 * Redis persistence helpers for arbitrage opportunities.
 * All functions are stateless and easily unit-testable in isolation.
 */

import type { ArbitrageOpportunity, SpreadDetectorRedis } from './spread-detector-types';

/**
 * Persist an opportunity to Redis for the execution module.
 */
export async function storeOpportunityToRedis(
  redis: SpreadDetectorRedis,
  opp: ArbitrageOpportunity
): Promise<void> {
  const key = `arbitrage:opportunities:${opp.id}`;
  const data = {
    ...opp,
    buyPrice: opp.buyPrice.toString(),
    sellPrice: opp.sellPrice.toString(),
    spread: opp.spread.toString(),
    spreadPercent: opp.spreadPercent.toString(),
    score: opp.score?.toString() ?? '',
    latency: opp.latency.toString(),
  };

  const pipeline = redis.pipeline();
  pipeline.hset(key, data);
  pipeline.expire(key, 60); // 1 minute TTL
  await pipeline.exec();
}

/**
 * Retrieve recent arbitrage opportunities from Redis.
 */
export async function loadRecentOpportunities(
  redis: SpreadDetectorRedis,
  count = 100
): Promise<ArbitrageOpportunity[]> {
  const keys = await redis.keys('arbitrage:opportunities:*');
  const opportunities: ArbitrageOpportunity[] = [];

  for (const key of keys.slice(0, count)) {
    const data = await redis.hgetall(key);
    if (data && Object.keys(data).length > 0) {
      opportunities.push({
        id: data.id || '',
        symbol: data.symbol || '',
        buyExchange: data.buyExchange || '',
        sellExchange: data.sellExchange || '',
        buyPrice: parseFloat(data.buyPrice) || 0,
        sellPrice: parseFloat(data.sellPrice) || 0,
        spread: parseFloat(data.spread) || 0,
        spreadPercent: parseFloat(data.spreadPercent) || 0,
        timestamp: parseInt(data.timestamp) || 0,
        latency: parseInt(data.latency) || 0,
        score: data.score ? parseFloat(data.score) : undefined,
      });
    }
  }

  return opportunities.sort((a, b) => b.timestamp - a.timestamp);
}
