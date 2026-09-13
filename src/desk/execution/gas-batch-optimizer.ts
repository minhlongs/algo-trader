/**
 * Gas Batch Optimizer
 * Collects pending trades in a time window, then flushes as a batch to reduce gas costs.
 */

import { logger } from '../../shared/utils/logger';
import {
  PendingTrade,
  TradeResult,
  BatchExecutor,
  SingleExecutor,
  BatchOptimizerConfig,
} from './gas-batch-optimizer-types';
import {
  resolveBatchOutcomes,
  rejectMissingTrades,
  executeFallbackTrades,
} from './gas-batch-optimizer-fallback';

export type {
  PendingTrade,
  TradeResult,
  BatchExecutor,
  SingleExecutor,
  BatchOptimizerConfig,
};

/**
 * Batches trades within a configurable time window to minimise gas / API calls.
 */
export class GasBatchOptimizer {
  private readonly windowMs: number;
  private readonly maxBatchSize: number;
  private readonly batchExecutor: BatchExecutor;
  private readonly singleExecutor: SingleExecutor;

  private pendingBatch: PendingTrade[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private flushRequested = false;

  private resolvers = new Map<string, (result: TradeResult) => void>();

  constructor(
    batchExecutor: BatchExecutor,
    singleExecutor: SingleExecutor,
    config: BatchOptimizerConfig = {}
  ) {
    this.windowMs = config.windowMs ?? 5_000;
    this.maxBatchSize = config.maxBatchSize ?? 10;
    this.batchExecutor = batchExecutor;
    this.singleExecutor = singleExecutor;
  }

  addTrade(trade: PendingTrade): Promise<TradeResult> {
    return new Promise((resolve) => {
      this.resolvers.set(trade.id, resolve);
      this.pendingBatch.push(trade);

      logger.debug('[GasBatchOptimizer] Trade queued', {
        tradeId: trade.id,
        queueSize: this.pendingBatch.length,
      });

      if (this.pendingBatch.length >= this.maxBatchSize) {
        this.scheduleFlush(0);
      } else if (!this.flushTimer) {
        this.scheduleFlush(this.windowMs);
      }
    });
  }

  private scheduleFlush(delayMs: number): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flushBatch(), delayMs);
  }

  async flushBatch(): Promise<void> {
    if (this.isFlushing) {
      if (this.pendingBatch.length > 0) {
        this.flushRequested = true;
      }
      return;
    }
    if (this.pendingBatch.length === 0) return;

    this.isFlushing = true;
    this.flushTimer = null;
    this.flushRequested = false;

    const batch = this.pendingBatch.splice(0, this.pendingBatch.length);

    logger.info('[GasBatchOptimizer] Flushing batch', { count: batch.length });

    try {
      const results = await this.batchExecutor(batch);
      resolveBatchOutcomes(results, this.resolvers);
      rejectMissingTrades(batch, this.resolvers);
    } catch (err) {
      logger.warn('[GasBatchOptimizer] Batch failed — falling back to individual execution', {
        error: err instanceof Error ? err.message : String(err),
        count: batch.length,
      });
      await executeFallbackTrades(batch, this.singleExecutor, this.resolvers);
    } finally {
      this.isFlushing = false;
      if (this.flushRequested && this.pendingBatch.length > 0) {
        this.flushRequested = false;
        this.scheduleFlush(0);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingBatch.length > 0) {
      await this.flushBatch();
    }
    logger.info('[GasBatchOptimizer] Shutdown complete');
  }

  get queueSize(): number {
    return this.pendingBatch.length;
  }
}
