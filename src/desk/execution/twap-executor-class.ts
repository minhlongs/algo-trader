/**
 * TWAP Order Executor — Class Implementation
 *
 * Splits large orders into $500-$2K chunks with orderbook depth checks.
 * Aborts if slippage exceeds threshold, chunk times out, or 3 consecutive failures.
 * Handles SIGTERM gracefully — cancels remaining chunks.
 *
 * Extracted from twap-executor.ts to keep files under 200 lines.
 * Re-exported via twap-executor.ts facade.
 */

import { logger } from '../utils/logger';
import {
  TwapConfig, TwapOrder, TwapResult, TwapChunkResult,
  GetDepthFn, ExecuteChunkFn, GetPriceFn,
  DEFAULT_TWAP_CONFIG, FLOAT_EPSILON,
} from './twap-executor-types';

export class TwapExecutor {
  private config: TwapConfig;
  private activeController: AbortController | null = null;
  private activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(config?: Partial<TwapConfig>) {
    this.config = { ...DEFAULT_TWAP_CONFIG, ...config };
    // EC#25: Instance registry instead of overwrite — support multiple concurrent instances
    if (!TwapExecutor.signalHandlerRegistered) {
      TwapExecutor.signalHandlerRegistered = true;
      if (typeof process !== 'undefined' && process.on) {
        process.on('SIGTERM', () => { TwapExecutor.activeInstances.forEach((inst) => inst.cancelActive('SIGTERM received')); });
        process.on('SIGINT', () => { TwapExecutor.activeInstances.forEach((inst) => inst.cancelActive('SIGINT received')); });
      }
    }
    TwapExecutor.activeInstances.add(this);
  }

  private static signalHandlerRegistered = false;
  private static activeInstances: Set<TwapExecutor> = new Set();

  cancelActive(reason: string): void {
    if (this.activeController && !this.activeController.signal.aborted) {
      logger.warn(`[TWAP] Cancelling active execution: ${reason}`);
      this.activeController.abort(reason);
    }
  }

  destroy(): void {
    TwapExecutor.activeInstances.delete(this);
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers.clear();
    if (this.activeController && !this.activeController.signal.aborted) {
      this.activeController.abort('Instance destroyed');
    }
    this.activeController = null;
  }

  planChunks(totalSizeUsd: number, requestedChunkSize?: number): number[] {
    const chunkSize = Math.max(this.config.minChunkUsd, Math.min(this.config.maxChunkUsd, requestedChunkSize ?? this.config.maxChunkUsd));
    const chunks: number[] = [];
    let remaining = totalSizeUsd;
    while (remaining > 0) {
      const size = Math.min(chunkSize, remaining);
      if (size < this.config.minChunkUsd && chunks.length > 0) {
        chunks[chunks.length - 1] += size;
        remaining = 0;
      } else {
        chunks.push(size);
        remaining -= size;
      }
    }
    return chunks;
  }

  async execute(order: TwapOrder, getDepth: GetDepthFn, executeChunk: ExecuteChunkFn, getPrice: GetPriceFn): Promise<TwapResult> {
    // EC#27: Each execute() gets its own controller — no race from concurrent calls
    const controller = new AbortController();
    this.activeController = controller;
    const { signal } = controller;

    const startedAt = Date.now();
    const delayMs = order.delayMs ?? this.config.delayMs;
    const maxSlippage = order.maxSlippagePercent ?? this.config.maxSlippagePercent;

    const arrivalPrice = await getPrice(order.marketId);
    const chunks = this.planChunks(order.totalSizeUsd, order.chunkSizeUsd);

    const result: TwapResult = {
      marketId: order.marketId, side: order.side,
      totalSizeUsd: order.totalSizeUsd, executedSizeUsd: 0,
      chunksPlanned: chunks.length, chunksExecuted: 0,
      averagePrice: 0, arrivalPrice, totalSlippagePercent: 0,
      aborted: false, chunks: [], startedAt, completedAt: 0,
    };

    let totalCostWeighted = 0;
    let consecutiveFailures = 0;

    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) {
        result.aborted = true;
        result.abortReason = result.abortReason ?? String(signal.reason ?? 'Aborted');
        break;
      }

      let chunkSize = chunks[i];
      const depth = await getDepth(order.marketId, order.side);
      if (depth > 0 && chunkSize > depth * (this.config.maxDepthPercent / 100)) {
        const reducedSize = depth * (this.config.maxDepthPercent / 100);
        logger.info(`[TWAP] Chunk ${i + 1} reduced from $${chunkSize.toFixed(0)} to $${reducedSize.toFixed(0)} (depth: $${depth.toFixed(0)})`);
        chunkSize = Math.max(this.config.minChunkUsd, reducedSize);
      }

      try {
        const timer = setTimeout(() => this.activeTimers.delete(timer), this.config.chunkTimeoutMs);
        this.activeTimers.add(timer);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Chunk timeout after ${this.config.chunkTimeoutMs}ms`)), this.config.chunkTimeoutMs);
        });
        const { executedPrice, filledUsd } = await Promise.race([
          executeChunk(order.marketId, order.side, chunkSize, signal),
          timeoutPromise,
        ]);

        consecutiveFailures = 0;
        const slippagePercent = arrivalPrice > 0 ? Math.abs(executedPrice - arrivalPrice) / arrivalPrice * 100 : 0;
        const chunkResult: TwapChunkResult = {
          chunkIndex: i, sizeUsd: filledUsd, executedPrice, arrivalPrice,
          slippagePercent, status: filledUsd >= chunkSize * 0.95 ? 'filled' : 'partial', timestamp: Date.now(),
        };
        result.chunks.push(chunkResult);
        result.executedSizeUsd += filledUsd;
        result.chunksExecuted++;
        totalCostWeighted += executedPrice * filledUsd;

        if (slippagePercent > maxSlippage + FLOAT_EPSILON) {
          result.aborted = true;
          result.abortReason = `Slippage ${slippagePercent.toFixed(2)}% exceeds max ${maxSlippage}%`;
          logger.warn(`[TWAP] Aborted: ${result.abortReason}`);
          controller.abort(result.abortReason);
          break;
        }
        logger.info(`[TWAP] Chunk ${i + 1}/${chunks.length}: $${filledUsd.toFixed(0)} @ ${executedPrice.toFixed(4)} (slippage: ${slippagePercent.toFixed(2)}%)`);
      } catch (error) {
        consecutiveFailures++;
        result.chunks.push({ chunkIndex: i, sizeUsd: 0, executedPrice: 0, arrivalPrice, slippagePercent: 0, status: 'failed', timestamp: Date.now() });
        logger.error(`[TWAP] Chunk ${i + 1} failed (consecutive: ${consecutiveFailures}):`, { error });
        if (consecutiveFailures >= this.config.maxConsecutiveFailures) {
          result.aborted = true;
          result.abortReason = `${consecutiveFailures} consecutive chunk failures`;
          logger.warn(`[TWAP] Aborted: ${result.abortReason}`);
          controller.abort(result.abortReason);
          break;
        }
      }

      if (i < chunks.length - 1 && !result.aborted && !signal.aborted) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted during delay')); }, { once: true });
        }).catch(() => {
          result.aborted = true;
          result.abortReason = result.abortReason ?? 'Cancelled during inter-chunk delay';
        });
      }
    }

    result.averagePrice = result.executedSizeUsd > 0 ? totalCostWeighted / result.executedSizeUsd : 0;
    result.totalSlippagePercent = arrivalPrice > 0 ? Math.abs(result.averagePrice - arrivalPrice) / arrivalPrice * 100 : 0;
    result.completedAt = Date.now();
    this.activeController = null;
    logger.info(`[TWAP] Complete: ${result.chunksExecuted}/${result.chunksPlanned} chunks, $${result.executedSizeUsd.toFixed(0)}/$${order.totalSizeUsd.toFixed(0)}, avg slippage ${result.totalSlippagePercent.toFixed(2)}%`);
    return result;
  }

  getConfig(): TwapConfig { return { ...this.config }; }
}
