/**
 * Spread Detector Pricing Logic
 * Pure functions for fetching best prices and evaluating spreads.
 * All functions are stateless and easily unit-testable in isolation.
 */

import type {
  ArbitrageOpportunity,
  SpreadConfig,
  ExchangeLatency,
  PriceCacheEntry,
  ScoringModel,
  SpreadDetectorRedis,
  BestPrices,
} from './spread-detector-types';
import {
  calculateFees,
  calculateSlippage,
  calculateOpportunityScore,
} from './spread-detector-calculations';

/**
 * Context interface providing dependencies for pricing operations.
 * Implemented by SpreadDetector class.
 */
export interface PricingContext {
  redis: SpreadDetectorRedis;
  priceCache: Map<string, PriceCacheEntry>;
  config: SpreadConfig;
  scoringModel: ScoringModel;
  getExchangeLatency(exchange: string): ExchangeLatency;
}

/**
 * Get ticker key for Redis storage.
 */
export function getTickerKey(exchange: string, symbol: string): string {
  return `ticker:${exchange}:${symbol}`;
}

/**
 * Get cache key for in-memory price cache.
 */
export function getCacheKey(exchange: string, symbol: string): string {
  return `${exchange}:${symbol}`;
}

/**
 * Fetch best bid/ask across all exchanges using parallel Redis pipeline.
 * Optimized for sub-500ms p95 latency via batch pipelining + in-memory cache.
 */
export async function fetchBestPrices(
  ctx: PricingContext,
  symbol: string,
  exchanges: string[]
): Promise<{
  bestBid: { exchange: string; price: number; latency: number } | null;
  bestAsk: { exchange: string; price: number; latency: number } | null;
  allPrices: Array<{ exchange: string; bid: number; ask: number; latency: number }>;
}> {
  const startTime = Date.now();
  const allPrices: Array<{ exchange: string; bid: number; ask: number; latency: number }> = [];

  // Batch all hgetall calls in a single pipeline
  const pipeline = ctx.redis.pipeline();
  exchanges.forEach((ex) => pipeline.hgetall(getTickerKey(ex, symbol)));
  const results = await pipeline.exec();

  for (let i = 0; i < exchanges.length; i++) {
    const exchange = exchanges[i];
    const result = results?.[i];
    const ticker: Record<string, string> =
      (Array.isArray(result) ? {} : result) as Record<string, string> || {};
    const cacheKey = getCacheKey(exchange, symbol);

    if (!ticker || Object.keys(ticker).length === 0) {
      // Fall back to in-memory cache on Redis miss
      const cached = ctx.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ctx.config.cacheTTL) {
        allPrices.push({
          exchange,
          bid: cached.bid,
          ask: cached.ask,
          latency: cached.latency,
        });
      }
      continue;
    }

    const bid = parseFloat(ticker.bid) || 0;
    const ask = parseFloat(ticker.ask) || 0;

    if (bid > 0 && ask > 0) {
      const exLatency = ctx.getExchangeLatency(exchange);

      ctx.priceCache.set(cacheKey, {
        bid,
        ask,
        timestamp: Date.now(),
        exchange,
        symbol,
        latency: exLatency.p95Latency,
      });

      allPrices.push({
        exchange,
        bid,
        ask,
        latency: exLatency.p95Latency,
      });
    }
  }

  // Suppress unused variable warning — startTime used for future latency tracking
  void (Date.now() - startTime);

  let bestBid: { exchange: string; price: number; latency: number } | null = null;
  let bestAsk: { exchange: string; price: number; latency: number } | null = null;

  for (const price of allPrices) {
    if (price.bid > 0 && (!bestBid || price.bid > bestBid.price)) {
      bestBid = { exchange: price.exchange, price: price.bid, latency: price.latency };
    }
    if (price.ask > 0 && (!bestAsk || price.ask < bestAsk.price)) {
      bestAsk = { exchange: price.exchange, price: price.ask, latency: price.latency };
    }
  }

  return { bestBid, bestAsk, allPrices };
}

/**
 * Evaluate spread for a symbol given best bid/ask, applying fees and slippage.
 * Returns null if no opportunity exceeds the minimum spread threshold.
 */
export async function evaluateSpread(
  ctx: PricingContext,
  symbol: string,
  bestBid: { exchange: string; price: number; latency: number },
  bestAsk: { exchange: string; price: number; latency: number },
  scanLatency: number
): Promise<ArbitrageOpportunity | null> {
  const fees = calculateFees(bestBid.exchange, bestAsk.exchange, bestBid.price, bestAsk.price);
  const slippage = calculateSlippage(bestBid, bestAsk);

  const grossSpread = bestBid.price - bestAsk.price;
  const netSpread = grossSpread - fees.netFee - slippage.totalSlippage;
  const spreadPercent = (netSpread / bestAsk.price) * 100;

  if (spreadPercent <= ctx.config.minSpreadPercent) return null;

  const score = ctx.config.enableMLScoring
    ? calculateOpportunityScore(
        { spreadPercent, latency: Math.max(bestBid.latency, bestAsk.latency), fees },
        ctx.scoringModel,
        ctx.config.maxLatencyMs
      )
    : undefined;

  if (score !== undefined && score < ctx.scoringModel.thresholds.minScore) return null;

  const { thresholds } = ctx.scoringModel;

  return {
    id: `arb-${symbol}-${Date.now()}`,
    symbol,
    buyExchange: bestAsk.exchange,
    sellExchange: bestBid.exchange,
    buyPrice: bestAsk.price,
    sellPrice: bestBid.price,
    spread: netSpread,
    spreadPercent,
    timestamp: Date.now(),
    latency: scanLatency,
    score,
    confidence: score !== undefined
      ? score >= thresholds.highConfidenceScore
        ? 'high'
        : score >= thresholds.minScore
          ? 'medium'
          : 'low'
      : undefined,
    fees,
    slippage,
  };
}