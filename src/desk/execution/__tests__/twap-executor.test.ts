/**
 * TWAP Executor Tests
 * Covers: planChunks, execute, cancelActive, destroy, getConfig
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwapExecutor, type GetDepthFn, type ExecuteChunkFn, type GetPriceFn } from '../twap-executor';

// Reset static state between tests
let twap: TwapExecutor;
const mockGetPrice: GetPriceFn = vi.fn().mockResolvedValue(0.55);
const mockGetDepth: GetDepthFn = vi.fn().mockResolvedValue(50000);
const mockExecuteChunk: ExecuteChunkFn = vi.fn().mockResolvedValue({ executedPrice: 0.55, filledUsd: 1000 });

describe('TwapExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    twap = new TwapExecutor();
  });

  afterEach(() => {
    twap.destroy();
  });

  describe('planChunks', () => {
    it('splits $5000 into $2000+$2000+$1000 chunks', () => {
      const chunks = twap.planChunks(5000);
      expect(chunks).toEqual([2000, 2000, 1000]);
    });

    it('splits $500 into single chunk', () => {
      const chunks = twap.planChunks(500);
      expect(chunks).toEqual([500]);
    });

    it('merges small leftover into last chunk', () => {
      const chunks = twap.planChunks(4300, 2000);
      // 2000 + 2000 + 300 → 300 < 500 min → merge: [2000, 2300]
      expect(chunks).toEqual([2000, 2300]);
    });

    it('respects custom chunk size', () => {
      const chunks = twap.planChunks(3000, 1000);
      expect(chunks).toEqual([1000, 1000, 1000]);
    });

    it('clamps chunk size to min/max', () => {
      const small = twap.planChunks(6000, 100); // 100 < min 500
      expect(small[0]).toBeGreaterThanOrEqual(500);

      const big = twap.planChunks(6000, 5000); // 5000 > max 2000
      expect(big[0]).toBeLessThanOrEqual(2000);
    });

    it('returns empty array for zero size', () => {
      expect(twap.planChunks(0)).toEqual([]);
    });
  });

  describe('getConfig', () => {
    it('returns a copy of the config', () => {
      const config = twap.getConfig();
      expect(config.minChunkUsd).toBe(500);
      expect(config.maxChunkUsd).toBe(2000);
      expect(config.delayMs).toBe(30000);
      config.minChunkUsd = 1; // mut shouldn't affect internal
      expect(twap.getConfig().minChunkUsd).toBe(500);
    });

    it('reflects custom constructor config', () => {
      const custom = new TwapExecutor({ minChunkUsd: 100, maxChunkUsd: 500 });
      expect(custom.getConfig().minChunkUsd).toBe(100);
      expect(custom.getConfig().maxChunkUsd).toBe(500);
      custom.destroy();
    });
  });

  describe('cancelActive', () => {
    it('cancels in-progress execution (multi-chunk)', async () => {
      let resolveChunk: (() => void) | undefined;
      const slowExec: ExecuteChunkFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveChunk = () => resolve({ executedPrice: 0.55, filledUsd: 1000 }); })
      );

      const promise = twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, slowExec, mockGetPrice
      );

      // Wait for first chunk to complete, second to start
      await new Promise((r) => setTimeout(r, 20));
      twap.cancelActive('manual cancel');
      resolveChunk?.(); // unblock chunk but signal is already aborted

      const result = await promise;
      expect(result.aborted).toBe(true);
    });

    it('does nothing if no active controller', () => {
      // No active execution — should not throw
      twap.cancelActive('no-op');
    });
  });

  describe('destroy', () => {
    it('clears timers and controller', async () => {
      let resolveChunk: (() => void) | undefined;
      const slowExec: ExecuteChunkFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveChunk = () => resolve({ executedPrice: 0.55, filledUsd: 1000 }); })
      );

      const promise = twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, slowExec, mockGetPrice
      );

      await new Promise((r) => setTimeout(r, 20));
      twap.destroy();
      resolveChunk?.();

      const result = await promise;
      expect(result.aborted).toBe(true);
    });
  });

  describe('full execution', () => {
    it('executes all chunks successfully', async () => {
      const goodExec: ExecuteChunkFn = vi.fn().mockResolvedValue({ executedPrice: 0.551, filledUsd: 1000 });

      const result = await twap.execute(
        { marketId: 'market-1', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, goodExec, mockGetPrice
      );

      expect(result.chunksExecuted).toBe(3);
      expect(result.executedSizeUsd).toBe(3000);
      expect(result.aborted).toBe(false);
      expect(result.averagePrice).toBeCloseTo(0.551, 3);
      expect(result.completedAt).toBeGreaterThan(0);
    });

    it('handles partial fills', async () => {
      const partialExec: ExecuteChunkFn = vi.fn()
        .mockResolvedValueOnce({ executedPrice: 0.55, filledUsd: 1000 })
        .mockResolvedValueOnce({ executedPrice: 0.55, filledUsd: 800 });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 2000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, partialExec, mockGetPrice
      );

      expect(result.executedSizeUsd).toBe(1800);
      expect(result.chunks[1].status).toBe('partial');
    });

    it('handles chunk execution failure without abort', async () => {
      const failExec: ExecuteChunkFn = vi.fn()
        .mockResolvedValueOnce({ executedPrice: 0.55, filledUsd: 1000 })
        .mockRejectedValueOnce(new Error('network error'));

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 2000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, failExec, mockGetPrice
      );

      expect(result.chunksExecuted).toBe(1);
      expect(result.chunks[1].status).toBe('failed');
    });

    it('resets consecutive failures after a success', async () => {
      let call = 0;
      const mixedExec: ExecuteChunkFn = vi.fn().mockImplementation(async () => {
        call++;
        if (call === 1 || call === 3) return { executedPrice: 0.55, filledUsd: 1000 };
        if (call === 2) throw new Error('fail');
        return { executedPrice: 0.55, filledUsd: 1000 };
      });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 4000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, mixedExec, mockGetPrice
      );

      // 1 success, 1 fail, 1 success (reset counter), 1 success
      expect(result.chunksExecuted).toBe(3);
      expect(result.aborted).toBe(false);
    });
  });

  describe('consecutive failures abort', () => {
    it('aborts after maxConsecutiveFailures', async () => {
      const failExec: ExecuteChunkFn = vi.fn().mockRejectedValue(new Error('fail'));

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 5000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, failExec, mockGetPrice
      );

      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain('3 consecutive');
      expect(result.chunksExecuted).toBe(0);
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks.every((c) => c.status === 'failed')).toBe(true);
    });
  });

  describe('depth check', () => {
    it('reduces chunk when exceeding depth threshold', async () => {
      const smallDepth: GetDepthFn = vi.fn().mockResolvedValue(5000);
      const tracker = vi.fn().mockResolvedValue({ executedPrice: 0.55, filledUsd: 100 });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 1000, delayMs: 0 },
        smallDepth, tracker, mockGetPrice
      );

      // 2% of $5K = $100, chunk should be reduced
      const calledSize = tracker.mock.calls[0]?.[2];
      expect(calledSize).toBeLessThanOrEqual(500);
    });

    it('does not reduce chunk when depth is zero', async () => {
      const zeroDepth: GetDepthFn = vi.fn().mockResolvedValue(0);
      const tracker = vi.fn().mockResolvedValue({ executedPrice: 0.55, filledUsd: 1000 });

      await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 1000, delayMs: 0 },
        zeroDepth, tracker, mockGetPrice
      );

      // depth=0 should skip the reduction check
      expect(tracker.mock.calls[0]?.[2]).toBe(1000);
    });

    it('does not reduce chunk when already within depth threshold', async () => {
      const deepPool: GetDepthFn = vi.fn().mockResolvedValue(1_000_000);
      const tracker = vi.fn().mockResolvedValue({ executedPrice: 0.55, filledUsd: 500 });

      await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 500, delayMs: 0 },
        deepPool, tracker, mockGetPrice
      );

      // 2% of $1M = $20K, $500 chunk is well within
      expect(tracker.mock.calls[0]?.[2]).toBe(500);
    });
  });

  describe('slippage abort', () => {
    it('aborts when slippage exceeds threshold', async () => {
      const badExecution: ExecuteChunkFn = vi.fn()
        .mockResolvedValueOnce({ executedPrice: 0.55, filledUsd: 1000 })
        .mockResolvedValueOnce({ executedPrice: 0.60, filledUsd: 1000 });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, badExecution, mockGetPrice
      );

      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain('Slippage');
      expect(result.chunksExecuted).toBe(2);
    });

    it('respects order-level maxSlippagePercent override', async () => {
      const badExec: ExecuteChunkFn = vi.fn().mockResolvedValue({ executedPrice: 0.60, filledUsd: 500 });
      // arrivalPrice=0.55, execPrice=0.60 → 9.09% slippage, threshold=5% → abort
      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 500, maxSlippagePercent: 5.0, delayMs: 0 },
        mockGetDepth, badExec, mockGetPrice
      );

      expect(result.aborted).toBe(true);
      expect(result.abortReason).toContain('Slippage');
    });
  });

  describe('chunk timeout', () => {
    it('aborts remaining chunks when a chunk times out', async () => {
      const slowExec: ExecuteChunkFn = vi.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Chunk timeout after')), 200))
      );

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, slowExec, mockGetPrice
      );

      expect(result.chunks[0].status).toBe('failed');
    });
  });

  describe('SIGTERM abort', () => {
    it('cancels execution on SIGTERM', async () => {
      const spy = vi.spyOn(process, 'emit');
      let resolveChunk: (() => void) | undefined;
      const slowExec: ExecuteChunkFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveChunk = () => resolve({ executedPrice: 0.55, filledUsd: 1000 }); })
      );

      const promise = twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 2000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, slowExec, mockGetPrice
      );

      await new Promise((r) => setTimeout(r, 20));
      process.emit('SIGTERM', 'SIGTERM');
      resolveChunk?.();

      const result = await promise;
      expect(result.aborted).toBe(true);
      spy.mockRestore();
    });
  });

  describe('abort during inter-chunk delay', () => {
    it('aborts during delay between chunks', async () => {
      let chunkCount = 0;
      const slowDelayExec: ExecuteChunkFn = vi.fn().mockImplementation(async () => {
        chunkCount++;
        if (chunkCount === 2) {
          // Abort during 2nd chunk to trigger delay abort on 3rd
          setTimeout(() => twap.cancelActive('abort in delay'), 10);
        }
        return { executedPrice: 0.55, filledUsd: 1000 };
      });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 3000, chunkSizeUsd: 1000, delayMs: 50 },
        mockGetDepth, slowDelayExec, mockGetPrice
      );

      expect(result.aborted).toBe(true);
    });
  });

  describe('metrics', () => {
    it('tracks average price and total slippage', async () => {
      const exec: ExecuteChunkFn = vi.fn()
        .mockResolvedValueOnce({ executedPrice: 0.551, filledUsd: 1000 })
        .mockResolvedValueOnce({ executedPrice: 0.553, filledUsd: 1000 });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 2000, chunkSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, exec, mockGetPrice
      );

      expect(result.averagePrice).toBeCloseTo(0.552, 3);
      expect(result.totalSlippagePercent).toBeGreaterThan(0);
    });

    it('handles arrivalPrice=0 gracefully', async () => {
      const zeroPrice: GetPriceFn = vi.fn().mockResolvedValue(0);
      const exec: ExecuteChunkFn = vi.fn().mockResolvedValue({ executedPrice: 0, filledUsd: 1000 });

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 1000, delayMs: 0 },
        mockGetDepth, exec, zeroPrice
      );

      expect(result.arrivalPrice).toBe(0);
      expect(result.totalSlippagePercent).toBe(0);
      expect(result.averagePrice).toBe(0);
    });

    it('returns averagePrice=0 and totalSlippage=0 when no chunks executed', async () => {
      const failExec: ExecuteChunkFn = vi.fn().mockRejectedValue(new Error('nope'));

      const result = await twap.execute(
        { marketId: 'test', side: 'buy', totalSizeUsd: 500, delayMs: 0 },
        mockGetDepth, failExec, mockGetPrice
      );

      // Only 1 chunk planned, 1 fails, abort after 1 consecutive failure (< 3 max)
      // But with default maxConsecutiveFailures=3, it won't abort after 1 failure
      // The chunk fails, result has 0 executedSizeUsd
      expect(result.executedSizeUsd).toBe(0);
      expect(result.averagePrice).toBe(0);
    });
  });
});
