/**
 * Strategy Orchestrator
 * Coordinates feed aggregator, spread detector, signal scorer, and unified execution engine
 * Manages opportunity queue with backpressure, graceful shutdown, and metrics emission
 */

import { FeedAggregator, FeedMessage } from '../feeds/feed-aggregator';
import { SpreadDetector, ArbitrageOpportunity as SpreadArbitrageOpportunity } from './spread-detector';
import { SignalScorer, SignalScore } from './signal-scorer';
import { UnifiedExecutionEngine, createUnifiedExecutionEngine, UnifiedExecutorConfig } from './unified-executor';
import { ArbitrageOpportunity, ArbitrageLeg, ExecutionResult, ExchangeId } from './types';
import { logger } from '../../shared/utils/logger';
import { EventEmitter } from 'events';

export type StrategyType =
  | 'cross-exchange'
  | 'triangular'
  | 'dex-cex'
  | 'funding-rate'
  | 'binary-arb'
  | 'settlement-arb'
  | 'split-merge'
  | 'cross-market'
  | 'all';

export interface OrchestratorConfig {
  // Feed aggregator
  symbols: string[];
  exchanges: ('binance' | 'okx' | 'bybit')[];

  // Spread detector
  minSpreadPercent?: number;
  checkIntervalMs?: number;
  maxLatencyMs?: number;

  // Signal scorer
  scoreWeights?: {
    spread: number;
    latency: number;
    volume: number;
    reliability: number;
  };
  scoreThresholds?: {
    strongBuy: number;
    buy: number;
    hold: number;
  };

  // Execution engine
  executionConfig?: UnifiedExecutorConfig;

  // Queue management
  maxQueueSize?: number; // default 50

  // Strategy filtering
  strategy?: StrategyType; // default 'all'

  // General
  dryRun?: boolean;
  verbose?: boolean;
}

export interface OrchestratorMetrics {
  // Feed
  feedConnected: boolean;
  feedLatencyMs: number;
  messagesReceived: number;

  // Detection
  scansPerformed: number;
  opportunitiesDetected: number;
  p95DetectionLatencyMs: number;

  // Scoring
  signalsScored: number;
  actionableSignals: number;

  // Execution
  executionsAttempted: number;
  executionsSucceeded: number;
  executionsFailed: number;
  totalProfit: number;
  p95ExecutionLatencyMs: number;

  // Queue
  queueSize: number;
  queueDropped: number;

  // General
  uptimeMs: number;
  isRunning: boolean;
}

interface QueuedOpportunity {
  opportunity: ArbitrageOpportunity;
  score: SignalScore;
  enqueuedAt: number;
}

export class StrategyOrchestrator extends EventEmitter {
  private config: Required<OrchestratorConfig>;
  private feedAggregator: FeedAggregator;
  private spreadDetector: SpreadDetector;
  private signalScorer: SignalScorer;
  private executionEngine: UnifiedExecutionEngine;

  private running = false;
  private startTime = 0;
  private intervalId: NodeJS.Timeout | null = null;

  // Opportunity queue with backpressure
  private queue: QueuedOpportunity[] = [];
  private queueDropped = 0;

  // Metrics
  private metrics: OrchestratorMetrics = {
    feedConnected: false,
    feedLatencyMs: 0,
    messagesReceived: 0,
    scansPerformed: 0,
    opportunitiesDetected: 0,
    p95DetectionLatencyMs: 0,
    signalsScored: 0,
    actionableSignals: 0,
    executionsAttempted: 0,
    executionsSucceeded: 0,
    executionsFailed: 0,
    totalProfit: 0,
    p95ExecutionLatencyMs: 0,
    queueSize: 0,
    queueDropped: 0,
    uptimeMs: 0,
    isRunning: false,
  };

  // Latency tracking for p95
  private detectionLatencies: number[] = [];
  private executionLatencies: number[] = [];

  constructor(config: OrchestratorConfig) {
    super();
    // Apply defaults
    this.config = {
      symbols: config.symbols,
      exchanges: config.exchanges,
      minSpreadPercent: config.minSpreadPercent ?? 0.05,
      checkIntervalMs: config.checkIntervalMs ?? 50,
      maxLatencyMs: config.maxLatencyMs ?? 500,
      scoreWeights: config.scoreWeights ?? { spread: 0.4, latency: 0.25, volume: 0.2, reliability: 0.15 },
      scoreThresholds: config.scoreThresholds ?? { strongBuy: 85, buy: 70, hold: 50 },
      executionConfig: config.executionConfig ?? { dryRun: config.dryRun ?? true },
      maxQueueSize: config.maxQueueSize ?? 50,
      dryRun: config.dryRun ?? true,
      verbose: config.verbose ?? true,
      strategy: config.strategy ?? 'all',
    };

    // Initialize components
    this.feedAggregator = new FeedAggregator();
    this.spreadDetector = new SpreadDetector({
      minSpreadPercent: this.config.minSpreadPercent,
      maxLatencyMs: this.config.maxLatencyMs,
      checkIntervalMs: this.config.checkIntervalMs,
      enableMLScoring: true,
      enableLatencyOptimization: true,
    });
    this.signalScorer = new SignalScorer({
      weights: this.config.scoreWeights,
      thresholds: this.config.scoreThresholds,
    });
    this.executionEngine = createUnifiedExecutionEngine(this.config.executionConfig);

    // Wire up feed aggregator
    this.feedAggregator.onFeed(this.handleFeedMessage.bind(this));
  }

  /**
   * Start the orchestrator - connects feeds, begins scanning loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[Orchestrator] Already running');
      return;
    }

    logger.info('[Orchestrator] Starting strategy orchestrator...');
    this.startTime = Date.now();
    this.running = true;
    this.metrics.isRunning = true;

    try {
      // Connect feed aggregator
      await this.feedAggregator.connect();
      this.metrics.feedConnected = true;

      // Subscribe to symbols
      await this.feedAggregator.subscribe(this.config.symbols);

      // Start continuous scanning loop
      this.intervalId = setInterval(async () => {
        await this.scanAndExecute();
      }, this.config.checkIntervalMs);

      logger.info('[Orchestrator] Strategy orchestrator started', {
        symbols: this.config.symbols.length,
        exchanges: this.config.exchanges.length,
        queueCapacity: this.config.maxQueueSize,
        dryRun: this.config.dryRun,
      });

      // Emit started event for CLI compatibility
      this.emit('started', {
        symbols: this.config.symbols,
        exchanges: this.config.exchanges,
      });
    } catch (error) {
      this.running = false;
      this.metrics.isRunning = false;
      logger.error('[Orchestrator] Failed to start:', { error });
      throw error;
    }
  }

  /**
   * Stop the orchestrator gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('[Orchestrator] Not running');
      return;
    }

    logger.info('[Orchestrator] Stopping strategy orchestrator...');
    this.running = false;
    this.metrics.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Drain queue before stopping
    await this.drainQueue();

    // Disconnect feeds
    await this.feedAggregator.disconnect();
    this.metrics.feedConnected = false;

    logger.info('[Orchestrator] Strategy orchestrator stopped', {
      uptimeMs: Date.now() - this.startTime,
      totalExecutions: this.metrics.executionsAttempted,
      totalProfit: this.metrics.totalProfit,
    });
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): OrchestratorMetrics {
    this.metrics.uptimeMs = Date.now() - this.startTime;
    this.metrics.queueSize = this.queue.length;
    this.metrics.queueDropped = this.queueDropped;

    // Update feed latency
    let totalLatency = 0;
    let latencyCount = 0;
    for (const exchange of this.config.exchanges) {
      for (const symbol of this.config.symbols) {
        const lat = this.feedAggregator.getAverageLatency(exchange, symbol);
        if (lat > 0) {
          totalLatency += lat;
          latencyCount++;
        }
      }
    }
    this.metrics.feedLatencyMs = latencyCount > 0 ? totalLatency / latencyCount : 0;

    // Update p95 latencies
    this.metrics.p95DetectionLatencyMs = this.calculateP95(this.detectionLatencies);
    this.metrics.p95ExecutionLatencyMs = this.calculateP95(this.executionLatencies);

    return { ...this.metrics };
  }

  /**
   * Handle incoming feed messages - update spread detector cache
   */
  private handleFeedMessage(msg: FeedMessage): void {
    this.metrics.messagesReceived++;

    // Feed order book updates into spread detector's Redis cache
    // The spread detector reads from Redis, so we need to publish ticker updates
    if (msg.type === 'ticker') {
      // In a real implementation, this would write to Redis
      // The spread detector already has Redis integration
    }
  }

  /**
   * Main scan loop - detect, score, queue, execute
   */
  private async scanAndExecute(): Promise<void> {
    if (!this.running) return;

    const scanStart = Date.now();

    try {
      // 1. Detect opportunities using spread detector
      const spreadOpportunities = await this.spreadDetector.scan(
        this.config.symbols,
        this.config.exchanges
      );

      this.metrics.scansPerformed++;
      this.metrics.opportunitiesDetected += spreadOpportunities.length;

      // Record detection latency
      const detectionLatency = Date.now() - scanStart;
      this.detectionLatencies.push(detectionLatency);
      if (this.detectionLatencies.length > 1000) this.detectionLatencies.shift();

      // 2. Score and filter opportunities using spread-detector format
      for (const spreadOpp of spreadOpportunities) {
        // Score using spread-detector format (SignalScorer expects this format)
        const score = this.signalScorer.score(spreadOpp);
        this.metrics.signalsScored++;

        if (score.recommendation === 'STRONG_BUY' || score.recommendation === 'BUY') {
          this.metrics.actionableSignals++;
          // Convert to unified format for execution engine
          const unifiedOpp: ArbitrageOpportunity = this.convertToUnifiedOpportunity(spreadOpp);

          // Apply strategy filter
          if (this.matchesStrategyFilter(unifiedOpp)) {
            await this.enqueueOpportunity(unifiedOpp, score);
          }
        }
      }

      // 3. Process queue (execute opportunities)
      await this.processQueue();

    } catch (error) {
      logger.error('[Orchestrator] Scan cycle error:', { error });
    }
  }

  /**
   * Check if an opportunity matches the configured strategy filter
   */
  private matchesStrategyFilter(opportunity: ArbitrageOpportunity): boolean {
    const { strategy } = this.config;
    if (strategy === 'all') return true;
    if (strategy === 'cross-exchange' && opportunity.type === 'cross-exchange') return true;
    if (strategy === 'triangular' && opportunity.type === 'triangular') return true;
    if (strategy === 'dex-cex' && opportunity.type === 'dex-cex') return true;
    if (strategy === 'funding-rate' && opportunity.type === 'funding-rate') return true;
    if (strategy === 'binary-arb' && opportunity.type === 'binary-arb') return true;
    if (strategy === 'split-merge' && opportunity.type === 'settlement-arb') return true;
    if (strategy === 'cross-market' && opportunity.type === 'cross-market') return true;
    return false;
  }

  /**
   * Convert SpreadDetector opportunity to unified ArbitrageOpportunity
   */
  private convertToUnifiedOpportunity(spreadOpp: SpreadArbitrageOpportunity): ArbitrageOpportunity {
    const legs: ArbitrageLeg[] = [
      {
        exchange: spreadOpp.buyExchange as ExchangeId,
        symbol: spreadOpp.symbol,
        side: 'buy',
        price: spreadOpp.buyPrice,
        amount: 1000 / spreadOpp.buyPrice,
        fee: spreadOpp.fees?.buyFee ?? 0,
      },
      {
        exchange: spreadOpp.sellExchange as ExchangeId,
        symbol: spreadOpp.symbol,
        side: 'sell',
        price: spreadOpp.sellPrice,
        amount: 1000 / spreadOpp.sellPrice,
        fee: spreadOpp.fees?.sellFee ?? 0,
      },
    ];

    return {
      id: spreadOpp.id,
      type: 'cross-exchange',
      legs,
      expectedProfit: spreadOpp.spread,
      expectedProfitPct: spreadOpp.spreadPercent,
      totalFees: (spreadOpp.fees?.buyFee ?? 0) + (spreadOpp.fees?.sellFee ?? 0),
      confidence: this.confidenceToNumeric(spreadOpp.confidence ?? 'medium'),
      detectedAt: spreadOpp.timestamp,
      expiresAt: spreadOpp.timestamp + 5000,
    };
  }

  /**
   * Convert confidence string to numeric value
   */
  private confidenceToNumeric(confidence: 'high' | 'medium' | 'low' | undefined): number {
    switch (confidence) {
      case 'high': return 95;
      case 'medium': return 70;
      case 'low': return 40;
      default: return 50;
    }
  }

  /**
   * Add opportunity to queue with backpressure handling
   */
  private async enqueueOpportunity(opp: ArbitrageOpportunity, score: SignalScore): Promise<void> {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Drop lowest-scored opportunity (FIFO with priority)
      this.queue.sort((a, b) => a.score.totalScore - b.score.totalScore);
      this.queue.shift();
      this.queueDropped++;
      logger.debug('[Orchestrator] Queue full, dropped lowest-scored opportunity');
    }

    this.queue.push({ opportunity: opp, score, enqueuedAt: Date.now() });

    // Sort by score descending (highest priority first)
    this.queue.sort((a, b) => b.score.totalScore - a.score.totalScore);
  }

  /**
   * Process queued opportunities
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const now = Date.now();

    // Process all valid opportunities (within expiry)
    const validQueue = this.queue.filter(
      q => q.opportunity.expiresAt > now
    );

    // Update queue (remove expired)
    this.queue = validQueue;

    for (const queued of validQueue) {
      if (!this.running) break;

      this.metrics.executionsAttempted++;
      const execStart = Date.now();

      try {
        const result = await this.executionEngine.execute(queued.opportunity);

        const execLatency = Date.now() - execStart;
        this.executionLatencies.push(execLatency);
        if (this.executionLatencies.length > 1000) this.executionLatencies.shift();

        if (result.success) {
          this.metrics.executionsSucceeded++;
          this.metrics.totalProfit += result.actualProfit;

          // Update signal scorer reliability
          this.signalScorer.updateReliability(queued.opportunity.legs[0].exchange, true);
        } else {
          this.metrics.executionsFailed++;
          this.signalScorer.updateReliability(queued.opportunity.legs[0].exchange, false);
        }

        if (this.config.verbose) {
          logger.info('[Orchestrator] Execution result', {
            id: result.opportunityId,
            success: result.success,
            profit: result.actualProfit,
            latencyMs: execLatency,
          });
        }
      } catch (error) {
        this.metrics.executionsFailed++;
        logger.error('[Orchestrator] Execution error:', { error });
      }
    }
  }

  /**
   * Drain remaining queue on shutdown
   */
  private async drainQueue(): Promise<void> {
    logger.info('[Orchestrator] Draining queue...', { remaining: this.queue.length });

    for (const queued of this.queue) {
      try {
        await this.executionEngine.execute(queued.opportunity);
      } catch (error) {
        logger.error('[Orchestrator] Drain execution error:', { error });
      }
    }

    this.queue = [];
  }

  /**
   * Calculate p95 from latency samples
   */
  private calculateP95(samples: number[]): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  }
}

/**
 * Factory function to create orchestrator with defaults
 */
export function createStrategyOrchestrator(config?: Partial<OrchestratorConfig>): StrategyOrchestrator {
  const defaultConfig: OrchestratorConfig = {
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    exchanges: ['binance', 'okx', 'bybit'],
    dryRun: true,
    verbose: true,
    ...config,
  };
  return new StrategyOrchestrator(defaultConfig);
}