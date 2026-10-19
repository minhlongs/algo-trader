/**
 * TWAP Order Executor — Types & Interfaces
 *
 * Extracted from twap-executor.ts to keep files under 200 lines.
 * Re-exported via twap-executor.ts facade.
 */

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

export const DEFAULT_TWAP_CONFIG: TwapConfig = {
  minChunkUsd: 500,
  maxChunkUsd: 2000,
  delayMs: 30000,
  maxSlippagePercent: 2.0,
  maxDepthPercent: 2.0,
  chunkTimeoutMs: 30000,
  maxConsecutiveFailures: 3,
};

/** Epsilon for floating-point comparisons */
export const FLOAT_EPSILON = 0.0001;

export function planTwapChunks(
  config: TwapConfig,
  totalSizeUsd: number,
  requestedChunkSize?: number,
): number[] {
  const chunkSize = Math.max(config.minChunkUsd, Math.min(config.maxChunkUsd, requestedChunkSize ?? config.maxChunkUsd));
  const chunks: number[] = [];
  let remaining = totalSizeUsd;
  while (remaining > 0) {
    const size = Math.min(chunkSize, remaining);
    if (size < config.minChunkUsd && chunks.length > 0) {
      chunks[chunks.length - 1] += size;
      remaining = 0;
    } else {
      chunks.push(size);
      remaining -= size;
    }
  }
  return chunks;
}

export function createInitialTwapResult(
  order: TwapOrder,
  arrivalPrice: number,
  chunksPlanned: number,
  startedAt: number,
): TwapResult {
  return {
    marketId: order.marketId, side: order.side,
    totalSizeUsd: order.totalSizeUsd, executedSizeUsd: 0,
    chunksPlanned, chunksExecuted: 0,
    averagePrice: 0, arrivalPrice, totalSlippagePercent: 0,
    aborted: false, chunks: [], startedAt, completedAt: 0,
  };
}

export function finalizeTwapResult(result: TwapResult, totalCostWeighted: number, arrivalPrice: number): void {
  result.averagePrice = result.executedSizeUsd > 0 ? totalCostWeighted / result.executedSizeUsd : 0;
  result.totalSlippagePercent = arrivalPrice > 0 ? (Math.abs(result.averagePrice - arrivalPrice) / arrivalPrice) * 100 : 0;
  result.completedAt = Date.now();
}

export function waitInterChunkDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Aborted during delay')); }, { once: true });
  });
}
