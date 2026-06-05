/**
 * TWAP Order Executor
 * Splits large orders into $500-$2K chunks with orderbook depth checks.
 * Aborts if slippage exceeds threshold, chunk times out, or 3 consecutive failures.
 * Handles SIGTERM gracefully — cancels remaining chunks.
 */

import { logger } from '../utils/logger';

export interface TwapConfig {
  /** Min chunk size in USD (default $500) */
  minChunkUsd: number;
  /** Max chunk size in USD (default $2000) */
  maxChunkUsd: number;
  /** Delay between chunks in ms (default 30s) */
  delayMs: number;
  /** Max slippage % before aborting (default 2%) */
  maxSlippagePercent: number;
  /** Max % of visible depth our chunk can consume (default 2%) */
  maxDepthPercent: number;
  /** Per-chunk timeout in ms (default 30s) — hangs abort remaining chunks */
  chunkTimeoutMs: number;
  /** Consecutive failures before aborting entire order (default 3) */
  maxConsecutiveFailures: number;
}

export interface TwapOrder {
  marketId: string;
  side: 'buy' | 'sell';
  totalSizeUsd: number;
  chunkSizeUsd?: number;
  delayMs?: number;
  maxSlippagePercent?: number;
}

export interface TwapChunkResult {
  chunkIndex: number;
  sizeUsd: number;
  executedPrice: number;
  arrivalPrice: number;
  slippagePercent: number;
  status: 'filled' | 'partial' | 'failed';
  timestamp: number;
}

export interface TwapResult {
  marketId: string;
  side: 'buy' | 'sell';
  totalSizeUsd: number;
  executedSizeUsd: number;
  chunksPlanned: number;
  chunksExecuted: number;
  averagePrice: number;
  arrivalPrice: number;
  totalSlippagePercent: number;
  aborted: boolean;
  abortReason?: string;
  chunks: TwapChunkResult[];
  startedAt: number;
  completedAt: number;
}

/** Callback to get current orderbook depth (USD) for a market */
export type GetDepthFn = (marketId: string, side: 'buy' | 'sell') => Promise<number>;

/** Callback to execute a single chunk order, returns executed price */
export type ExecuteChunkFn = (
  marketId: string,
  side: 'buy' | 'sell',
  sizeUsd: number,
  signal?: AbortSignal
) => Promise<{ executedPrice: number; filledUsd: number }>;

/** Callback to get current market price */
export type GetPriceFn = (marketId: string) => Promise<number>;

const DEFAULT_CONFIG: TwapConfig = {
  minChunkUsd: 500,
  maxChunkUsd: 2000,
  delayMs: 30000,
  maxSlippagePercent: 2.0,
  maxDepthPercent: 2.0,
  chunkTimeoutMs: 30000,
  maxConsecutiveFailures: 3,
};

/** Epsilon for floating-point comparisons */
const FLOAT_EPSILON = 0.0001;

export class TwapExecutor {
  private config: TwapConfig;
  private activeController: AbortController | null = null;
  private activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(config?: Partial<TwapConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // EC#25: Instance registry instead of overwrite — support multiple concurrent instances
    if (!TwapExecutor.signalHandlerRegistered) {
      TwapExecutor.signalHandlerRegistered = true;
      if (typeof process !== 'undefined' && process.on) {
        process.on('SIGTERM', () => {
          TwapExecutor.activeInstances.forEach((inst) => inst.cancelActive('SIGTERM received'));
        });
        process.on('SIGINT', () => {
          TwapExecutor.activeInstances.forEach((inst) => inst.cancelActive('SIGINT received'));
        });
      }
    }
    TwapExecutor.activeInstances.add(this);
  }

  /** Singleton tracking to avoid duplicate signal handlers across instances */
  private static signalHandlerRegistered = false;
  private static activeInstances: Set<TwapExecutor> = new Set();

  /** Cancel any in-progress TWAP execution */
  cancelActive(reason: string): void {
    if (this.activeController && !this.activeController.signal.aborted) {
      logger.warn(`[TWAP] Cancelling active execution: ${reason}`);
      this.activeController.abort(reason);
    }
  }

  /** Cleanup: remove from registry and clear all timers */
  destroy(): void {
    TwapExecutor.activeInstances.delete(this);
    this.activeTimers.forEach((t) => clearTimeout(t));
    this.activeTimers.clear();
    if (this.activeController && !this.activeController.signal.aborted) {
      this.activeController.abort('Instance destroyed');
    }
    this.activeController = null;
  }

  /** Plan chunk sizes for a TWAP order */
  planChunks(totalSizeUsd: number, requestedChunkSize?: number): number[] {
    const chunkSize = Math.max(
      this.config.minChunkUsd,
      Math.min(this.config.maxChunkUsd, requestedChunkSize ?? this.config.maxChunkUsd)
    );

    const chunks: number[] = [];
    let remaining = totalSizeUsd;

    while (remaining > 0) {
      const size = Math.min(chunkSize, remaining);
      // If leftover is too small, merge into last chunk
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

  /** Execute a TWAP order with depth checks, slippage monitoring, and timeout/abort */
  async execute(
    order: TwapOrder,
    getDepth: GetDepthFn,
    executeChunk: ExecuteChunkFn,
    getPrice: GetPriceFn
  ): Promise<TwapResult> {
    // EC#27: Each execute() gets its own controller — no race from concurrent calls
    const controller = new AbortController();
    this.activeController = controller;
    const { signal } = controller;

    const startedAt = Date.now();
    const delayMs = order.delayMs ?? this.config.delayMs;
    const maxSlippage = order.maxSlippagePercent ?? this.config.maxSlippagePercent;

    // Get arrival price (benchmark)
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
      // Check if aborted externally (SIGTERM / slippage / consecutive failures)
      if (signal.aborted) {
        result.aborted = true;
        result.abortReason = result.abortReason ?? String(signal.reason ?? 'Aborted');
        break;
      }

      let chunkSize = chunks[i];

      // Check orderbook depth before each chunk
      const depth = await getDepth(order.marketId, order.side);
      if (depth > 0 && chunkSize > depth * (this.config.maxDepthPercent / 100)) {
        const reducedSize = depth * (this.config.maxDepthPercent / 100);
        logger.info(`[TWAP] Chunk ${i + 1} reduced from $${chunkSize.toFixed(0)} to $${reducedSize.toFixed(0)} (depth: $${depth.toFixed(0)})`);
        chunkSize = Math.max(this.config.minChunkUsd, reducedSize);
      }

      try {
        // Race chunk execution against per-chunk timeout
 const timer = setTimeout(() => reject(new Error(`Chunk timeout after ${this.config.chunkTimeoutMs}ms`)), this.config.chunkTimeoutMs);
 this.activeTimers.add(timer);
 const timeoutPromise = new Promise<never>((_, reject) => {
 setTimeout(() => reject(new Error(`Chunk timeout after ${this.config.chunkTimeoutMs}ms`)), timer);
 });
        const { executedPrice, filledUsd } = await Promise.race([
          executeChunk(order.marketId, order.side, chunkSize, signal),
          timeoutPromise,
        ]);

        consecutiveFailures = 0; // reset on success

        const slippagePercent = arrivalPrice > 0
          ? Math.abs(executedPrice - arrivalPrice) / arrivalPrice * 100
          : 0;

        const chunkResult: TwapChunkResult = {
          chunkIndex: i, sizeUsd: filledUsd, executedPrice, arrivalPrice,
          slippagePercent, status: filledUsd >= chunkSize * 0.95 ? 'filled' : 'partial',
          timestamp: Date.now(),
        };

        result.chunks.push(chunkResult);
        result.executedSizeUsd += filledUsd;
        result.chunksExecuted++;
        totalCostWeighted += executedPrice * filledUsd;

        // Check slippage threshold — abort if exceeded
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
        result.chunks.push({
          chunkIndex: i, sizeUsd: 0, executedPrice: 0, arrivalPrice,
          slippagePercent: 0, status: 'failed', timestamp: Date.now(),
        });
        logger.error(`[TWAP] Chunk ${i + 1} failed (consecutive: ${consecutiveFailures}):`, { error });

        // Abort after too many consecutive failures
        if (consecutiveFailures >= this.config.maxConsecutiveFailures) {
          result.aborted = true;
          result.abortReason = `${consecutiveFailures} consecutive chunk failures`;
          logger.warn(`[TWAP] Aborted: ${result.abortReason}`);
          controller.abort(result.abortReason);
          break;
        }
      }

      // Delay between chunks (skip after last, skip if aborted)
      if (i < chunks.length - 1 && !result.aborted && !signal.aborted) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted during delay'));
          }, { once: true });
        }).catch(() => {
          result.aborted = true;
          result.abortReason = result.abortReason ?? 'Cancelled during inter-chunk delay';
        });
      }
    }

    // Calculate final stats
    result.averagePrice = result.executedSizeUsd > 0 ? totalCostWeighted / result.executedSizeUsd : 0;
    result.totalSlippagePercent = arrivalPrice > 0
      ? Math.abs(result.averagePrice - arrivalPrice) / arrivalPrice * 100
      : 0;
    result.completedAt = Date.now();

    this.activeController = null;
    logger.info(`[TWAP] Complete: ${result.chunksExecuted}/${result.chunksPlanned} chunks, $${result.executedSizeUsd.toFixed(0)}/$${order.totalSizeUsd.toFixed(0)}, avg slippage ${result.totalSlippagePercent.toFixed(2)}%`);

    return result;
  }

  getConfig(): TwapConfig {
    return { ...this.config };
  }
}
