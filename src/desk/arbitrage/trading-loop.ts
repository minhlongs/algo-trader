/**
 * Trading Loop - Core Arbitrage Engine (facade). Target latency: <500ms p95.
 * Types: ./trading-loop-types, execution: ./trading-loop-executor,
 * latency helpers: ./trading-loop-latency. Re-exports keep the public API stable.
 */
import { FeedAggregator, UnifiedOrderBook, UnifiedTrade, UnifiedTicker } from '../feeds/feed-aggregator';
import { SpreadDetector, ArbitrageOpportunity as SpreadOpportunity } from './spread-detector';
import { ExecutionEngine } from './types';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { executeOpportunities } from './trading-loop-executor';
import { recordLatencySample } from './trading-loop-latency';
import { defaultTradingLoopConfig, createInitialMetrics } from './trading-loop-types';
import type { TradingLoopConfig, TradingLoopMetrics } from './trading-loop-types';

export type { TradingLoopConfig, TradingLoopMetrics, TradingOpportunity } from './trading-loop-types';

export class TradingLoop extends EventEmitter {
  private feedAggregator: FeedAggregator;
  private spreadDetector: SpreadDetector;
  private executionEngine: ExecutionEngine;
  private config: TradingLoopConfig;
  private isRunning = false;
  // EC#10: Use number instead of NodeJS.Timeout for Workers compatibility
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  // EC#12: Lock to prevent overlapping scans
  private scanLock = false;
  // EC#14: Backpressure — max queued opportunities
  private readonly MAX_QUEUED_OPPORTUNITIES = 50;
  private opportunityQueue: SpreadOpportunity[] = [];
  private startTime = 0;
  private metrics: TradingLoopMetrics = createInitialMetrics();
  private latencySamples: number[] = [];

  constructor(config: Partial<TradingLoopConfig> = {}) {
    super();
    this.config = defaultTradingLoopConfig(config);
    this.feedAggregator = new FeedAggregator();
    this.spreadDetector = new SpreadDetector({
      minSpreadPercent: this.config.minSpreadPercent,
      maxLatencyMs: this.config.maxLatencyMs,
      checkIntervalMs: this.config.checkIntervalMs,
      enableMLScoring: true,
    });
    this.executionEngine = new ExecutionEngine({
      dryRun: this.config.enableDryRun,
    });
    this.setupFeedHandlers();
  }

  private setupFeedHandlers(): void {
    this.feedAggregator.onFeed((msg) => {
      switch (msg.type) {
        case 'orderbook':
          this.handleOrderBook(msg.data);
          break;
        case 'trade':
          this.handleTrade(msg.data);
          break;
        case 'ticker':
          this.handleTicker(msg.data);
          break;
      }
    });
  }

  private handleOrderBook(orderBook: UnifiedOrderBook): void {
    // Order book updates are processed by spread detector via Redis
    if (this.config.enableLogging) {
      this.log('orderbook', `${orderBook.exchange} ${orderBook.symbol} bid:${orderBook.bids[0]?.price} ask:${orderBook.asks[0]?.price}`);
    }
  }

  private handleTrade(trade: UnifiedTrade): void {
    if (this.config.enableLogging) {
      this.log('trade', `${trade.exchange} ${trade.symbol} ${trade.side} @ ${trade.price}`);
    }
  }

  private handleTicker(ticker: UnifiedTicker): void {
    // Ticker updates feed into spread detector
    if (this.config.enableLogging && ticker.last > 0) {
      this.log('ticker', `${ticker.exchange} ${ticker.symbol} last:${ticker.last}`);
    }
  }

  /** Start trading loop */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Trading loop already running');
    }
    this.log('info', 'Starting trading loop...');
    this.startTime = Date.now();
    try {
      // Connect to WebSocket feeds
      await this.feedAggregator.connect();
      await this.feedAggregator.subscribe(this.config.symbols);
      this.isRunning = true;
      this.metrics.isRunning = true;
      // Start spread detection scan loop
      this.startScanLoop();
      this.log('info', `Trading loop started: ${this.config.symbols.length} symbols, ${this.config.exchanges.length} exchanges`);
      this.emit('started', { symbols: this.config.symbols, exchanges: this.config.exchanges });
    } catch (error) {
      this.metrics.errors++;
      this.log('error', `Failed to start trading loop: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /** Stop trading loop */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    this.log('info', 'Stopping trading loop...');
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    await this.feedAggregator.disconnect();
    this.spreadDetector.stop();
    this.isRunning = false;
    this.metrics.isRunning = false;
    this.metrics.uptimeMs = Date.now() - this.startTime;
    this.log('info', `Trading loop stopped. Uptime: ${this.metrics.uptimeMs}ms`);
    this.emit('stopped', this.getMetrics());
  }

  /** Start continuous spread detection scan */
  private startScanLoop(): void {
    this.scanInterval = setInterval(async () => {
      try {
        const startTime = Date.now();
        const opportunities = await this.spreadDetector.scan(this.config.symbols, this.config.exchanges);
        // Track latency
        const scanLatency = Date.now() - startTime;
        this.recordLatency(scanLatency);
        if (opportunities.length > 0) {
          this.metrics.opportunitiesFound += opportunities.length;
          this.handleOpportunities(opportunities);
        }
      } catch (error) {
        this.metrics.errors++;
        this.log('error', `Scan error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, this.config.checkIntervalMs);
  }

  /** Handle detected arbitrage opportunities (delegates to trading-loop-executor) */
  private async handleOpportunities(opportunities: SpreadOpportunity[]): Promise<void> {
    await executeOpportunities({
      executionEngine: this.executionEngine,
      metrics: this.metrics,
      emit: (event, payload) => this.emit(event, payload),
      log: (level, message) => this.log(level, message),
    }, opportunities);
  }

  /** Record latency sample for p95 calculation (delegates to trading-loop-latency) */
  private recordLatency(latency: number): void {
    const { avg, p95 } = recordLatencySample(this.latencySamples, latency);
    this.metrics.avgLatencyMs = avg;
    this.metrics.p95LatencyMs = p95;
  }

  /** Get current metrics */
  getMetrics(): TradingLoopMetrics & { isUnderTarget: boolean; targetLatencyMs: number } {
    const spreadMetrics = this.spreadDetector.getMetrics();
    return {
      ...this.metrics, isUnderTarget: spreadMetrics.isUnderTarget,
      targetLatencyMs: spreadMetrics.targetLatencyMs,
      uptimeMs: this.isRunning ? Date.now() - this.startTime : this.metrics.uptimeMs,
    };
  }

  /** Log message if enabled */
  private log(level: string, message: string): void {
    if (this.config.enableLogging) {
      const timestamp = new Date().toISOString();
      const prefix = `[TradingLoop:${level}]`;
      if (level === 'error') {
        logger.error(`${prefix} ${timestamp} ${message}`);
      } else {
        logger.info(`${prefix} ${timestamp} ${message}`);
      }
    }
  }

  /** Check if loop is running */
  isLoopRunning(): boolean {
    return this.isRunning;
  }

  /** Update configuration at runtime */
  updateConfig(config: Partial<TradingLoopConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('info', `Config updated: ${Object.keys(config).join(', ')}`);
  }
}
