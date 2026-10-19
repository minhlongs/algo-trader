/**
 * Spread Detector - Optimized for Sub-500ms p95 Latency
 * Detects arbitrage opportunities across exchanges with ML-based scoring.
 */

import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type {
  ArbitrageOpportunity,
  SpreadConfig,
  ExchangeLatency,
  PriceCacheEntry,
  ScanMetrics,
  SpreadDetectorRedis,
  BestPrices,
  SpreadMetricsReport,
} from './spread-detector-types';
import {
  createDefaultScoringModel,
  updateScanMetrics,
  recordExchangeLatencySample,
} from './spread-detector-calculations';
import { fetchBestPrices, evaluateSpread, PricingContext } from './spread-detector-pricing';
import {
  storeOpportunityToRedis,
  loadRecentOpportunities,
} from './spread-detector-persistence';

export type { ArbitrageOpportunity, SpreadConfig, ExchangeLatency, PriceCacheEntry, ScoringModel } from './spread-detector-types';

export class SpreadDetector {
  private redis: SpreadDetectorRedis;
  private config: SpreadConfig;
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private priceCache = new Map<string, PriceCacheEntry>();
  private exchangeLatencies = new Map<string, ExchangeLatency>();
  private latencySamples = new Map<string, number[]>();
  private scanStartTime = 0;
  private scoringModel = createDefaultScoringModel();
  private metrics: ScanMetrics = {
    totalScans: 0, opportunitiesFound: 0, avgScanDurationMs: 0,
    p95ScanDurationMs: 0, p99ScanDurationMs: 0, scanDurations: [],
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
  }

  private getExchangeLatency(exchange: string): ExchangeLatency {
    return this.exchangeLatencies.get(exchange) ?? ({ exchange, avgLatency: 100, p95Latency: 200, p99Latency: 300, successRate: 1, lastUpdate: Date.now() });
  }

  private buildContext(): PricingContext {
    return {
      redis: this.redis,
      priceCache: this.priceCache,
      config: this.config,
      scoringModel: this.scoringModel,
      getExchangeLatency: this.getExchangeLatency.bind(this),
    };
  }

  recordLatency(exchange: string, latency: number): void {
    recordExchangeLatencySample(this.latencySamples, this.exchangeLatencies, exchange, latency);
  }

  async getBestPrices(symbol: string, exchanges: string[]): Promise<BestPrices> {
    return fetchBestPrices(this.buildContext(), symbol, exchanges);
  }

  async calculateSpread(symbol: string, exchanges: string[]): Promise<ArbitrageOpportunity | null> {
    const startTime = Date.now();
    const { bestBid, bestAsk } = await this.getBestPrices(symbol, exchanges);
    if (!bestBid || !bestAsk) return null;
    return evaluateSpread(this.buildContext(), symbol, bestBid, bestAsk, Date.now() - startTime);
  }

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

    updateScanMetrics(this.metrics, Date.now() - this.scanStartTime);
    this.metrics.opportunitiesFound += opportunities.length;

    opportunities.sort((a, b) =>
      this.config.enableMLScoring ? (b.score || 0) - (a.score || 0) : b.spreadPercent - a.spreadPercent,
    );
    return opportunities;
  }

  start(symbols: string[], exchanges: string[], onOpportunity: (opps: ArbitrageOpportunity[]) => void): void {
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
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    this.running = false;
    logger.info('[SpreadDetector] Stopped');
  }

  getMetrics(): SpreadMetricsReport {
    return {
      ...this.metrics,
      isUnderTarget: this.metrics.p95ScanDurationMs <= this.config.maxLatencyMs,
      targetLatencyMs: this.config.maxLatencyMs,
    };
  }

  async storeOpportunity(opp: ArbitrageOpportunity): Promise<void> {
    await storeOpportunityToRedis(this.redis, opp);
  }

  async getRecentOpportunities(count = 100): Promise<ArbitrageOpportunity[]> {
    return loadRecentOpportunities(this.redis, count);
  }
}
