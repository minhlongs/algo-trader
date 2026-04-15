/**
 * Spread Detector - Optimized for Sub-500ms p95 Latency
 * Detects arbitrage opportunities across exchanges with ML-based scoring.
 *
 * Types live in ./spread-detector-types.ts
 * Pure calculation helpers in ./spread-detector-calculations.ts
 */

import { getRedisClient } from '../redis';
import { logger } from '../utils/logger';
import type {
  ArbitrageOpportunity,
  SpreadConfig,
  ExchangeLatency,
  PriceCacheEntry,
} from './spread-detector-types';
import {
  calculateFees,
  calculateSlippage,
  calculateOpportunityScore,
  computeLatencyStats,
  createDefaultScoringModel,
} from './spread-detector-calculations';

// Re-export types for consumers that import from this module
export type {
  ArbitrageOpportunity,
  SpreadConfig,
  ExchangeLatency,
  PriceCacheEntry,
} from './spread-detector-types';
export type { ScoringModel } from './spread-detector-types';

export class SpreadDetector {
  private redis: ReturnType<typeof getRedisClient>;
  private config: SpreadConfig;
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;

  // Performance tracking
  private priceCache: Map<string, PriceCacheEntry>;
  private exchangeLatencies: Map<string, ExchangeLatency>;
  private latencySamples: Map<string, number[]>;
  private scanStartTime: number = 0;

  // ML scoring model
  private scoringModel = createDefaultScoringModel();

  // Scan metrics
  private metrics = {
    totalScans: 0,
    opportunitiesFound: 0,
    avgScanDurationMs: 0,
    p95ScanDurationMs: 0,
    p99ScanDurationMs: 0,
    scanDurations: [] as number[],
  };

  constructor(config?: Partial<SpreadConfig>) {
    this.redis = getRedisClient();
    this.config = {
      minSpreadPercent: 0.08,
      maxLatencyMs: 500,
      checkIntervalMs: 50,
      enableMLScoring: config?.enableMLScoring ?? true,
      enableLatencyOptimization: config?.enableLatencyOptimization ?? true,
      cacheTTL: config?.cacheTTL ?? 1000,
      parallelBatchSize: config?.parallelBatchSize ?? 10,
      ...config,
    };

    this.priceCache = new Map();
    this.exchangeLatencies = new Map();
    this.latencySamples = new Map();
  }

  private getTickerKey(exchange: string, symbol: string): string {
    return `ticker:${exchange}:${symbol}`;
  }

  private getCacheKey(exchange: string, symbol: string): string {
    return `${exchange}:${symbol}`;
  }

  private getExchangeLatency(exchange: string): ExchangeLatency {
    return this.exchangeLatencies.get(exchange) ?? {
      exchange,
      avgLatency: 100,
      p95Latency: 200,
      p99Latency: 300,
      successRate: 1,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Record a latency sample for an exchange and update running statistics.
   */
  recordLatency(exchange: string, latency: number): void {
    if (!this.latencySamples.has(exchange)) {
      this.latencySamples.set(exchange, []);
    }

    const samples = this.latencySamples.get(exchange)!;
    samples.push(latency);

    // Keep last 100 samples
    if (samples.length > 100) samples.shift();

    const sorted = [...samples].sort((a, b) => a - b);
    const stats = computeLatencyStats(sorted);

    this.exchangeLatencies.set(exchange, {
      exchange,
      avgLatency: stats.avg,
      p95Latency: stats.p95,
      p99Latency: stats.p99,
      successRate: 1,
      lastUpdate: Date.now(),
    });
  }

  /**
   * Get best bid/ask across all exchanges using parallel Redis pipeline.
   * Optimized for sub-500ms p95 latency via batch pipelining + in-memory cache.
   */
  async getBestPrices(
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
    const pipeline = this.redis.pipeline();
    exchanges.forEach((ex) => pipeline.hgetall(this.getTickerKey(ex, symbol)));
    const results = await pipeline.exec();

    for (let i = 0; i < exchanges.length; i++) {
      const exchange = exchanges[i];
      const result = results?.[i];
      const ticker: Record<string, string> =
        (Array.isArray(result) ? {} : result) as Record<string, string> || {};
      const cacheKey = this.getCacheKey(exchange, symbol);

      if (!ticker || Object.keys(ticker).length === 0) {
        // Fall back to in-memory cache on Redis miss
        const cached = this.priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
          allPrices.push({ exchange, bid: cached.bid, ask: cached.ask, latency: cached.latency });
        }
        continue;
      }

      const bid = parseFloat(ticker.bid) || 0;
      const ask = parseFloat(ticker.ask) || 0;

      if (bid > 0 && ask > 0) {
        const exLatency = this.getExchangeLatency(exchange);

        this.priceCache.set(cacheKey, {
          bid, ask, timestamp: Date.now(), exchange, symbol,
          latency: exLatency.p95Latency,
        });

        allPrices.push({ exchange, bid, ask, latency: exLatency.p95Latency });
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
   * Calculate net spread for a symbol, applying fees and slippage.
   * Returns null if no opportunity exceeds the minimum spread threshold.
   */
  async calculateSpread(
    symbol: string,
    exchanges: string[]
  ): Promise<ArbitrageOpportunity | null> {
    const startTime = Date.now();
    const { bestBid, bestAsk } = await this.getBestPrices(symbol, exchanges);

    if (!bestBid || !bestAsk) return null;

    const fees = calculateFees(bestBid.exchange, bestAsk.exchange, bestBid.price, bestAsk.price);
    const slippage = calculateSlippage(bestBid, bestAsk);

    const grossSpread = bestBid.price - bestAsk.price;
    const netSpread = grossSpread - fees.netFee - slippage.totalSlippage;
    const spreadPercent = (netSpread / bestAsk.price) * 100;

    if (spreadPercent <= this.config.minSpreadPercent) return null;

    const score = this.config.enableMLScoring
      ? calculateOpportunityScore(
          { spreadPercent, latency: Math.max(bestBid.latency, bestAsk.latency), fees },
          this.scoringModel,
          this.config.maxLatencyMs
        )
      : undefined;

    if (score !== undefined && score < this.scoringModel.thresholds.minScore) return null;

    const scanLatency = Date.now() - startTime;
    const { thresholds } = this.scoringModel;

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
        ? score >= thresholds.highConfidenceScore ? 'high'
          : score >= thresholds.minScore ? 'medium'
          : 'low'
        : undefined,
      fees,
      slippage,
    };
  }

  /**
   * Scan all symbols for arbitrage opportunities using parallel batches.
   */
  async scan(symbols: string[], exchanges: string[]): Promise<ArbitrageOpportunity[]> {
    this.scanStartTime = Date.now();
    const opportunities: ArbitrageOpportunity[] = [];
    const batchSize = this.config.parallelBatchSize;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((sym) => this.calculateSpread(sym, exchanges)));
      for (const opp of results) {
        if (opp) opportunities.push(opp);
      }
    }

    // Update scan metrics
    const scanDuration = Date.now() - this.scanStartTime;
    this.metrics.totalScans++;
    this.metrics.scanDurations.push(scanDuration);
    this.metrics.opportunitiesFound += opportunities.length;

    if (this.metrics.scanDurations.length > 1000) this.metrics.scanDurations.shift();

    const sorted = [...this.metrics.scanDurations].sort((a, b) => a - b);
    const stats = computeLatencyStats(sorted);
    this.metrics.avgScanDurationMs = stats.avg;
    this.metrics.p95ScanDurationMs = stats.p95;
    this.metrics.p99ScanDurationMs = stats.p99;

    // Sort by score descending
    if (this.config.enableMLScoring) {
      opportunities.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else {
      opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);
    }

    return opportunities;
  }

  /**
   * Start continuous spread detection on a fixed interval.
   */
  start(
    symbols: string[],
    exchanges: string[],
    onOpportunity: (opps: ArbitrageOpportunity[]) => void
  ): void {
    if (this.running) return;

    this.running = true;
    logger.info(`[SpreadDetector] Started: ${symbols.length} symbols, ${exchanges.length} exchanges`);

    this.intervalId = setInterval(async () => {
      try {
        const opportunities = await this.scan(symbols, exchanges);
        if (opportunities.length > 0) onOpportunity(opportunities);
      } catch (error) {
        logger.error('SpreadDetector scan error:', { error });
      }
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('[SpreadDetector] Stopped');
  }

  getMetrics(): {
    totalScans: number;
    opportunitiesFound: number;
    avgScanDurationMs: number;
    p95ScanDurationMs: number;
    p99ScanDurationMs: number;
    isUnderTarget: boolean;
    targetLatencyMs: number;
  } {
    return {
      ...this.metrics,
      isUnderTarget: this.metrics.p95ScanDurationMs <= this.config.maxLatencyMs,
      targetLatencyMs: this.config.maxLatencyMs,
    };
  }

  /**
   * Persist an opportunity to Redis for the execution module.
   */
  async storeOpportunity(opp: ArbitrageOpportunity): Promise<void> {
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

    const pipeline = this.redis.pipeline();
    pipeline.hset(key, data);
    pipeline.expire(key, 60); // 1 minute TTL
    await pipeline.exec();
  }

  /**
   * Retrieve recent arbitrage opportunities from Redis.
   */
  async getRecentOpportunities(count = 100): Promise<ArbitrageOpportunity[]> {
    const keys = await this.redis.keys('arbitrage:opportunities:*');
    const opportunities: ArbitrageOpportunity[] = [];

    for (const key of keys.slice(0, count)) {
      const data = await this.redis.hgetall(key);
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
}
