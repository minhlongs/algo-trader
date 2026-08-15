/**
 * Strategy Orchestrator
 * Coordinates feed aggregator, spread detector, signal scorer, and unified execution engine
 * Manages opportunity queue with backpressure, graceful shutdown, and metrics emission
 */

import { FeedAggregator, FeedMessage } from '../feeds/feed-aggregator';
import { SpreadDetector } from './spread-detector';
import { SignalScorer } from './signal-scorer';
import { UnifiedExecutionEngine, createUnifiedExecutionEngine, UnifiedExecutorConfig } from './unified-executor';
import { logger } from '../../shared/utils/logger';
import { scanAndExecute, handleFeedMessage } from './orchestrator-scan';
import { EventEmitter } from 'events';

// Backward-compatible re-exports
export type { StrategyType, OrchestratorConfig, OrchestratorMetrics, QueuedOpportunity, OrchestratorContext } from './orchestrator-types';
export { enqueueOpportunity as enqueueOpportunityStandalone, processQueue as processQueueStandalone, drainQueue as drainQueueStandalone } from './orchestrator-queue';
export { convertToUnifiedOpportunity, confidenceToNumeric, matchesStrategyFilter } from './orchestrator-conversion';
import type { OrchestratorConfig, OrchestratorMetrics, QueuedOpportunity, OrchestratorContext } from './orchestrator-types';
import { drainQueue as drainQueueFn } from './orchestrator-queue';
import { computeMetrics } from './orchestrator-conversion';

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

  private detectionLatencies: number[] = [];
  private executionLatencies: number[] = [];
  constructor(config: OrchestratorConfig) {
    super();
    this.config = {
      symbols: config.symbols, exchanges: config.exchanges,
      minSpreadPercent: config.minSpreadPercent ?? 0.05, checkIntervalMs: config.checkIntervalMs ?? 50,
      maxLatencyMs: config.maxLatencyMs ?? 500,
      scoreWeights: config.scoreWeights ?? { spread: 0.4, latency: 0.25, volume: 0.2, reliability: 0.15 },
      scoreThresholds: config.scoreThresholds ?? { strongBuy: 85, buy: 70, hold: 50 },
      executionConfig: config.executionConfig ?? { dryRun: config.dryRun ?? true },
      maxQueueSize: config.maxQueueSize ?? 50, dryRun: config.dryRun ?? true,
      verbose: config.verbose ?? true, strategy: config.strategy ?? 'all',
      minSignalScore: config.minSignalScore ?? 0.5,
    };
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

    this.feedAggregator.onFeed(this.handleFeedMessage.bind(this));
  }

  private getOrchestratorContext(): OrchestratorContext {
    return {
      running: this.running,
      config: this.config,
      spreadDetector: this.spreadDetector,
      signalScorer: this.signalScorer,
      executionEngine: this.executionEngine,
      metrics: this.metrics,
      detectionLatencies: this.detectionLatencies,
      executionLatencies: this.executionLatencies,
      queue: this.queue,
      queueDropped: this.queueDropped,
    };
  }

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
      await this.feedAggregator.connect();
      this.metrics.feedConnected = true;

      await this.feedAggregator.subscribe(this.config.symbols);

      this.intervalId = setInterval(async () => {
        await this.scanAndExecute();
      }, this.config.checkIntervalMs);

      logger.info('[Orchestrator] Strategy orchestrator started', {
        symbols: this.config.symbols.length,
        exchanges: this.config.exchanges.length,
        queueCapacity: this.config.maxQueueSize,
        dryRun: this.config.dryRun,
      });

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

    await drainQueueFn(this.getOrchestratorContext(), this.executionEngine);

    await this.feedAggregator.disconnect();
    this.metrics.feedConnected = false;

    logger.info('[Orchestrator] Strategy orchestrator stopped', {
      uptimeMs: Date.now() - this.startTime,
      totalExecutions: this.metrics.executionsAttempted,
      totalProfit: this.metrics.totalProfit,
    });
  }

  getMetrics(): OrchestratorMetrics {
    this.metrics.uptimeMs = Date.now() - this.startTime;
    this.metrics.queueSize = this.queue.length;
    this.metrics.queueDropped = this.queueDropped;
    computeMetrics(this.feedAggregator, this.config.symbols, this.config.exchanges, this.metrics, this.detectionLatencies, this.executionLatencies);
    return { ...this.metrics };
  }

  private handleFeedMessage(msg: FeedMessage): void {
    handleFeedMessage(this.getOrchestratorContext(), msg);
  }

  private async scanAndExecute(): Promise<void> {
    await scanAndExecute(this.getOrchestratorContext());
  }
}

export function createStrategyOrchestrator(config?: Partial<OrchestratorConfig>): StrategyOrchestrator {
  const defaultConfig: OrchestratorConfig = {
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    exchanges: ['binance', 'okx', 'bybit'],
    minSignalScore: 0.5,
    dryRun: true,
    verbose: true,
    ...config,
  };
  return new StrategyOrchestrator(defaultConfig);
}
