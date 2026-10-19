/**
 * Opportunity Ingestion Pipeline & Arbitrage Engine Bridge
 * Wires SpreadDetector's onOpportunity hook into the arbitrage execution pipeline,
 * enforcing async error containment, high-frequency deduplication, bounded FIFO
 * queue backpressure, and net profitability hurdle gating (>= 10 bps).
 */

import { SpreadDetector } from './spread-detector';
import type { ArbitrageOpportunity } from './spread-detector-types';
import {
  NetProfitabilityCalculator,
  type NetProfitabilityAnalysis,
} from './net-profitability-calculator';
import { logger } from '../../shared/utils/logger';
import {
  type IngestionPipelineConfig,
  type IngestionMetrics,
  type IngestionPipelineDeps,
  type OpportunityEvaluationResult,
} from './ingestion/ingestion-types';
import { evaluateOpportunity } from './ingestion/ingestion-evaluator';
import { processOpportunityWorker } from './ingestion/ingestion-worker';
import { enqueueOpportunities } from './ingestion/ingestion-queue-ops';

export * from './ingestion/ingestion-types';
export * from './ingestion/ingestion-evaluator';
export * from './ingestion/ingestion-worker';

export class OpportunityIngestionPipeline {
  readonly config: IngestionPipelineConfig;
  private readonly spreadDetector: SpreadDetector;
  private readonly calculator: NetProfitabilityCalculator;
  private readonly queue: ArbitrageOpportunity[] = [];
  private readonly dedupCache = new Map<string, number>();
  private activeWorkers = 0;
  private isRunning = false;
  private onAdmittedCallback?: (
    opp: ArbitrageOpportunity,
    analysis: NetProfitabilityAnalysis
  ) => Promise<void> | void;
  private onRejectedCallback?: (
    opp: ArbitrageOpportunity,
    reason: string,
    analysis?: NetProfitabilityAnalysis
  ) => void;

  readonly metrics: IngestionMetrics = {
    scannedCount: 0,
    dedupDroppedCount: 0,
    queueDroppedCount: 0,
    admittedCount: 0,
    rejectedCount: 0,
  };

  constructor(
    config?: Partial<IngestionPipelineConfig>,
    deps?: IngestionPipelineDeps
  ) {
    this.config = {
      symbols: config?.symbols ?? ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      venues: config?.venues ?? ['binance', 'bybit', 'kucoin', 'polymarket'],
      minHurdleBps: config?.minHurdleBps ?? 10.0,
      baseNotionalUsd: config?.baseNotionalUsd ?? 1000.0,
      maxQueueSize: config?.maxQueueSize ?? 50,
      maxConcurrency: config?.maxConcurrency ?? 3,
      dedupTtlMs: config?.dedupTtlMs ?? 200,
      dryRun: config?.dryRun ?? true,
    };

    this.spreadDetector = deps?.spreadDetector ?? new SpreadDetector();
    this.calculator = deps?.calculator ?? new NetProfitabilityCalculator({
      defaultHurdleBps: this.config.minHurdleBps,
    });
    this.onAdmittedCallback = deps?.onAdmitted;
    this.onRejectedCallback = deps?.onRejected;
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('[OpportunityIngestionPipeline] Already running');
      return;
    }

    this.isRunning = true;
    logger.info('[OpportunityIngestionPipeline] Starting scanner', {
      symbols: this.config.symbols,
      venues: this.config.venues,
      minHurdleBps: this.config.minHurdleBps,
    });

    this.spreadDetector.start(
      this.config.symbols,
      this.config.venues,
      (opps: ArbitrageOpportunity[]) => {
        this.handleOpportunities(opps);
      }
    );
  }

  stop(): void {
    this.isRunning = false;
    this.spreadDetector.stop();
    this.queue.length = 0;
    this.dedupCache.clear();
    logger.info('[OpportunityIngestionPipeline] Stopped');
  }

  handleOpportunities(opps: ArbitrageOpportunity[]): void {
    try {
      if (!opps || opps.length === 0) return;
      enqueueOpportunities(opps, this.queue, this.dedupCache, this.config, this.metrics, Date.now());

      void this.processQueue().catch((err: unknown) => {
        logger.error('[OpportunityIngestionPipeline] Unexpected worker error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err: unknown) {
      logger.error('[OpportunityIngestionPipeline] Error in handleOpportunities synchronous wrapper', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async evaluateOpportunity(opp: ArbitrageOpportunity): Promise<OpportunityEvaluationResult> {
    return evaluateOpportunity(opp, this.calculator, this.config);
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.activeWorkers < this.config.maxConcurrency) {
      const opp = this.queue.shift();
      if (!opp) break;

      this.activeWorkers++;

      processOpportunityWorker({
        opp,
        metrics: this.metrics,
        evaluateFn: (o) => this.evaluateOpportunity(o),
        onAdmittedCallback: this.onAdmittedCallback,
        onRejectedCallback: this.onRejectedCallback,
      })
        .catch((err: unknown) => {
          logger.error('[OpportunityIngestionPipeline] Task uncaught rejection', {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.activeWorkers--;
          if (this.queue.length > 0) {
            void this.processQueue();
          }
        });
    }
  }
}

export class ArbitrageEngine extends OpportunityIngestionPipeline {}
