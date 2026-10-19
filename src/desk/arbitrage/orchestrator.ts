/**
 * Strategy Orchestrator
 * Coordinates feed aggregator, spread detector, signal scorer, and unified execution engine
 * Manages opportunity queue with backpressure, graceful shutdown, and metrics emission
 */

import { FeedAggregator, FeedMessage } from '../feeds/feed-aggregator';
import { SpreadDetector } from './spread-detector';
import { SignalScorer } from './signal-scorer';
import { UnifiedExecutionEngine, createUnifiedExecutionEngine } from './unified-executor';
import { scanAndExecute, handleFeedMessage } from './orchestrator-scan';
import { startOrchestrator, stopOrchestrator } from './orchestrator-lifecycle';
import { EventEmitter } from 'events';

// Backward-compatible re-exports
export type { StrategyType, OrchestratorConfig, OrchestratorMetrics, QueuedOpportunity, OrchestratorContext } from './orchestrator-types';
export { enqueueOpportunity as enqueueOpportunityStandalone, processQueue as processQueueStandalone, drainQueue as drainQueueStandalone } from './orchestrator-queue';
export { convertToUnifiedOpportunity, confidenceToNumeric, matchesStrategyFilter } from './orchestrator-conversion';
import type { OrchestratorConfig, OrchestratorMetrics, QueuedOpportunity, OrchestratorContext } from './orchestrator-types';
import { computeMetrics } from './orchestrator-conversion';

export class StrategyOrchestrator extends EventEmitter {
  config: Required<OrchestratorConfig>;
  feedAggregator: FeedAggregator;
  spreadDetector: SpreadDetector;
  signalScorer: SignalScorer;
  executionEngine: UnifiedExecutionEngine;

  running = false;
  startTime = 0;
  intervalId: NodeJS.Timeout | null = null;

  // Opportunity queue with backpressure
  queue: QueuedOpportunity[] = [];
  queueDropped = 0;

  metrics: OrchestratorMetrics = {
    feedConnected: false, feedLatencyMs: 0, messagesReceived: 0,
    scansPerformed: 0, opportunitiesDetected: 0, p95DetectionLatencyMs: 0,
    signalsScored: 0, actionableSignals: 0, executionsAttempted: 0,
    executionsSucceeded: 0, executionsFailed: 0, totalProfit: 0,
    p95ExecutionLatencyMs: 0, queueSize: 0, queueDropped: 0,
    uptimeMs: 0, isRunning: false,
  };

  detectionLatencies: number[] = [];
  executionLatencies: number[] = [];

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
      enableMLScoring: true, enableLatencyOptimization: true,
    });
    this.signalScorer = new SignalScorer({
      weights: this.config.scoreWeights,
      thresholds: this.config.scoreThresholds,
    });
    this.executionEngine = createUnifiedExecutionEngine(this.config.executionConfig);
    this.feedAggregator.onFeed(this.handleFeedMessage.bind(this));
  }

  getOrchestratorContext(): OrchestratorContext {
    return {
      running: this.running, config: this.config,
      spreadDetector: this.spreadDetector, signalScorer: this.signalScorer,
      executionEngine: this.executionEngine, metrics: this.metrics,
      detectionLatencies: this.detectionLatencies, executionLatencies: this.executionLatencies,
      queue: this.queue, queueDropped: this.queueDropped,
    };
  }

  async start(): Promise<void> {
    await startOrchestrator(this);
  }

  async stop(): Promise<void> {
    await stopOrchestrator(this);
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

  async scanAndExecute(): Promise<void> {
    await scanAndExecute(this.getOrchestratorContext());
  }
}

export function createStrategyOrchestrator(config?: Partial<OrchestratorConfig>): StrategyOrchestrator {
  return new StrategyOrchestrator({
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    exchanges: ['binance', 'okx', 'bybit'],
    minSignalScore: 0.5, dryRun: true, verbose: true, ...config,
  });
}
