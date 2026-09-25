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
  HURDLE_EPSILON_BPS,
  type NetProfitabilityAnalysis,
} from './net-profitability-calculator';
import { logger } from '../../shared/utils/logger';

export interface IngestionPipelineConfig {
  symbols: string[];
  venues: string[];
  minHurdleBps: number; // Default: 10 (0.10%)
  baseNotionalUsd: number; // Default: 1000.00
  maxQueueSize: number; // Default: 50
  maxConcurrency: number; // Default: 3
  dedupTtlMs: number; // Default: 200ms
  dryRun: boolean; // Default: true
}

export type ArbitrageEngineConfig = IngestionPipelineConfig;

export interface IngestionMetrics {
  scannedCount: number;
  dedupDroppedCount: number;
  queueDroppedCount: number;
  admittedCount: number;
  rejectedCount: number;
}

export interface IngestionPipelineDeps {
  spreadDetector?: SpreadDetector;
  calculator?: NetProfitabilityCalculator;
  onAdmitted?: (opp: ArbitrageOpportunity, analysis: NetProfitabilityAnalysis) => Promise<void> | void;
  onRejected?: (
    opp: ArbitrageOpportunity,
    reason: string,
    analysis?: NetProfitabilityAnalysis
  ) => void;
}

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

  /**
   * Start continuous spread detection wired into this ingestion pipeline.
   */
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

  /**
   * Graceful stop: terminates scanner loop and drains queue.
   */
  stop(): void {
    this.isRunning = false;
    this.spreadDetector.stop();
    this.queue.length = 0;
    this.dedupCache.clear();
    logger.info('[OpportunityIngestionPipeline] Stopped');
  }

  /**
   * Synchronous hook handler passed to spreadDetector.start().
   * Safely bridges synchronous scanner callback to async queue processing.
   * Guarantees NO unhandled rejection can crash the caller's setInterval loop.
   */
  handleOpportunities(opps: ArbitrageOpportunity[]): void {
    try {
      if (!opps || opps.length === 0) return;

      const now = Date.now();
      this.pruneDedupCache(now);

      for (const opp of opps) {
        this.metrics.scannedCount++;

        // Deduplication filter
        const dedupKey = `${opp.symbol}:${opp.buyExchange}:${opp.sellExchange}`;
        const lastSeen = this.dedupCache.get(dedupKey);

        if (lastSeen !== undefined && now - lastSeen < this.config.dedupTtlMs) {
          this.metrics.dedupDroppedCount++;
          logger.debug('[OpportunityIngestionPipeline] Duplicate dropped', { dedupKey });
          continue;
        }

        this.dedupCache.set(dedupKey, now);

        // Bounded FIFO queue with backpressure shedding
        if (this.queue.length >= this.config.maxQueueSize) {
          this.queue.shift(); // Drop oldest
          this.metrics.queueDroppedCount++;
          logger.warn('[OpportunityIngestionPipeline] Queue overflow, oldest opportunity dropped', {
            queueSize: this.queue.length,
            maxQueueSize: this.config.maxQueueSize,
          });
        }

        this.queue.push(opp);
      }

      // Kick queue processing asynchronously (floating promise shielded)
      void this.processQueue().catch((err: unknown) => {
        logger.error('[OpportunityIngestionPipeline] Unexpected worker error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err: unknown) {
      // Async boundary containment
      logger.error('[OpportunityIngestionPipeline] Error in handleOpportunities synchronous wrapper', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Evaluate a single opportunity against the net profitability engine and hurdle gate.
   */
  async evaluateOpportunity(opp: ArbitrageOpportunity): Promise<{
    passed: boolean;
    analysis: NetProfitabilityAnalysis;
    rejectionReason?: string;
  }> {
    const tradeAmount =
      opp.buyPrice > 0 ? this.config.baseNotionalUsd / opp.buyPrice : 1.0;

    const analysis = this.calculator.fromSpreadOpportunity(
      {
        buyExchange: opp.buyExchange,
        sellExchange: opp.sellExchange,
        symbol: opp.symbol,
        buyPrice: opp.buyPrice,
        sellPrice: opp.sellPrice,
        amount: tradeAmount,
        id: opp.id,
      },
      {
        minHurdleBps: this.config.minHurdleBps,
      }
    );

    const passed =
      analysis.isProfitable === true &&
      analysis.netProfitBps >= this.config.minHurdleBps - HURDLE_EPSILON_BPS &&
      analysis.netProfitUsd > 0 &&
      !analysis.breakdown?.insufficientLiquidity &&
      analysis.grossSpreadUsd > 0;

    const rejectionReason = passed
      ? undefined
      : analysis.rejectionReason ?? 'BELOW_HURDLE';

    return {
      passed,
      analysis,
      rejectionReason,
    };
  }

  /**
   * Internal queue processor respecting maxConcurrency semaphore.
   */
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.activeWorkers < this.config.maxConcurrency) {
      const opp = this.queue.shift();
      if (!opp) break;

      this.activeWorkers++;

      (async () => {
        let isAdmitted = false;
        let isRejected = false;
        let evalResult:
          | {
              passed: boolean;
              analysis: NetProfitabilityAnalysis;
              rejectionReason?: string;
            }
          | undefined;

        try {
          evalResult = await this.evaluateOpportunity(opp);

          if (evalResult.passed) {
            isAdmitted = true;
            this.metrics.admittedCount++;
            logger.info('[OpportunityIngestionPipeline] Opportunity admitted', {
              id: opp.id,
              symbol: opp.symbol,
              buyVenue: opp.buyExchange,
              sellVenue: opp.sellExchange,
              netProfitBps: evalResult.analysis.netProfitBps.toFixed(2),
              netProfitUsd: evalResult.analysis.netProfitUsd.toFixed(2),
            });
          } else {
            isRejected = true;
            this.metrics.rejectedCount++;
            const reason = evalResult.rejectionReason ?? 'BELOW_HURDLE';
            logger.debug('[OpportunityIngestionPipeline] Opportunity rejected', {
              id: opp.id,
              symbol: opp.symbol,
              reason,
              netProfitBps: evalResult.analysis.netProfitBps.toFixed(2),
            });
          }
        } catch (err: unknown) {
          if (!isAdmitted && !isRejected) {
            isRejected = true;
            this.metrics.rejectedCount++;
          }
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error('[OpportunityIngestionPipeline] Opportunity evaluation failed', {
            id: opp.id,
            symbol: opp.symbol,
            error: errorMsg,
          });

          if (this.onRejectedCallback) {
            try {
              this.onRejectedCallback(opp, 'EVALUATION_ERROR');
            } catch (cbErr: unknown) {
              logger.error('[OpportunityIngestionPipeline] onRejected callback threw', {
                error: cbErr instanceof Error ? cbErr.message : String(cbErr),
              });
            }
          }
          return;
        }

        // Post-evaluation callbacks: isolated from terminal metric counting
        if (isAdmitted && evalResult?.passed) {
          if (this.onAdmittedCallback) {
            try {
              await this.onAdmittedCallback(opp, evalResult.analysis);
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              logger.error('[OpportunityIngestionPipeline] onAdmitted callback execution failed', {
                id: opp.id,
                symbol: opp.symbol,
                error: errorMsg,
              });
            }
          }
        } else if (isRejected && evalResult && !evalResult.passed) {
          if (this.onRejectedCallback) {
            try {
              const reason = evalResult.rejectionReason ?? 'BELOW_HURDLE';
              this.onRejectedCallback(opp, reason, evalResult.analysis);
            } catch (err: unknown) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              logger.error('[OpportunityIngestionPipeline] onRejected callback execution failed', {
                id: opp.id,
                symbol: opp.symbol,
                error: errorMsg,
              });
            }
          }
        }
      })().catch((err: unknown) => {
        logger.error('[OpportunityIngestionPipeline] Task uncaught rejection', {
          error: err instanceof Error ? err.message : String(err),
        });
      }).finally(() => {
        this.activeWorkers--;
        // Trigger next in queue if available
        if (this.queue.length > 0) {
          void this.processQueue();
        }
      });
    }
  }

  private pruneDedupCache(now: number): void {
    if (this.dedupCache.size > 200) {
      for (const [key, timestamp] of this.dedupCache.entries()) {
        if (now - timestamp > this.config.dedupTtlMs * 2) {
          this.dedupCache.delete(key);
        }
      }
    }
  }
}

/**
 * Alias ArbitrageEngine pointing to OpportunityIngestionPipeline
 * for seamless compatibility with multi-milestone orchestrator naming.
 */
export class ArbitrageEngine extends OpportunityIngestionPipeline {}
