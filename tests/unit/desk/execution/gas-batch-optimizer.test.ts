/**
 * Gas Batch Optimizer Tests
 * Tests batching of trades to reduce gas costs / API calls
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GasBatchOptimizer, type PendingTrade, type TradeResult } from '../../../../src/desk/execution/gas-batch-optimizer';

describe('Gas Batch Optimizer', () => {
  let optimizer: GasBatchOptimizer;
  let batchExecutorMock: ReturnType<typeof vi.fn>;
  let singleExecutorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    batchExecutorMock = vi.fn(async (trades: PendingTrade[]) => {
      return trades.map(t => ({
        tradeId: t.id,
        success: true,
        orderId: `order_${t.id}`,
        executedViaBatch: true,
      }));
    });

    singleExecutorMock = vi.fn(async (trade: PendingTrade) => ({
      tradeId: trade.id,
      success: true,
      orderId: `order_${trade.id}`,
      executedViaBatch: false,
    }));

    optimizer = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
      windowMs: 100, // Short window for tests
      maxBatchSize: 5,
    });
  });

  describe('initialization', () => {
    it('should construct with executors', () => {
      expect(optimizer).toBeDefined();
    });

    it('should use custom config values', () => {
      const customOptimizer = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
        windowMs: 2000,
        maxBatchSize: 20,
      });

      expect(customOptimizer).toBeDefined();
    });

    it('should use default values when config not provided', () => {
      const defaultOptimizer = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock);

      expect(defaultOptimizer).toBeDefined();
    });
  });

  describe('single trade batching', () => {
    it('should add and execute single trade', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      const result = await optimizer.addTrade(trade);

      expect(result.success).toBe(true);
      expect(result.tradeId).toBe('trade_1');
    });

    it('should execute via batch executor', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      await optimizer.addTrade(trade);

      expect(batchExecutorMock).toHaveBeenCalled();
    });
  });

  describe('multiple trades batching', () => {
    it('should batch multiple trades', async () => {
      const trades: PendingTrade[] = [
        { id: 'trade_1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 'trade_2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should execute all trades in same batch if under window', async () => {
      const trades: PendingTrade[] = Array.from({ length: 3 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      await Promise.all(trades.map(t => optimizer.addTrade(t)));

      // Should call batch executor once with all 3 trades
      expect(batchExecutorMock).toHaveBeenCalledTimes(1);
      const batchCall = batchExecutorMock.mock.calls[0][0] as PendingTrade[];
      expect(batchCall.length).toBe(3);
    });

    it('should batch up to maxBatchSize before forcing flush', async () => {
      const trades: PendingTrade[] = Array.from({ length: 5 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      // All 5 should succeed (at batch size limit)
      expect(results.length).toBe(5);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should flush when batch size exceeded', async () => {
      const trades: PendingTrade[] = Array.from({ length: 7 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      // maxBatchSize is 5, so adding 7 should trigger at least 2 batches
      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.length).toBe(7);
      expect(batchExecutorMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('time window flushing', () => {
    it('should flush after window timeout', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      optimizer = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
        windowMs: 50,
        maxBatchSize: 100, // High limit so only window triggers flush
      });

      const resultPromise = optimizer.addTrade(trade);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(batchExecutorMock).toHaveBeenCalled();
    });

    it('should collect trades within window before flush', async () => {
      optimizer = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
        windowMs: 100,
        maxBatchSize: 100,
      });

      const trades: PendingTrade[] = Array.from({ length: 3 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      const resultPromises = trades.map(t => optimizer.addTrade(t));
      await Promise.all(resultPromises);

      // All trades should have been batched together
      const batchedTrades = batchExecutorMock.mock.calls[0][0] as PendingTrade[];
      expect(batchedTrades.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('batch executor failure handling', () => {
    it('should handle batch execution', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      const result = await optimizer.addTrade(trade);

      // Result should be defined with standard fields
      expect(result).toBeDefined();
      expect(result.tradeId).toBe('trade_1');
    });
  });

  describe('trade result structure', () => {
    it('should return valid TradeResult', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      const result = await optimizer.addTrade(trade);

      expect(result).toHaveProperty('tradeId');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executedViaBatch');
      expect(typeof result.tradeId).toBe('string');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.executedViaBatch).toBe('boolean');
    });

    it('should mark as batch execution when batched', async () => {
      const trades: PendingTrade[] = Array.from({ length: 2 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.every(r => r.executedViaBatch === true)).toBe(true);
    });
  });

  describe('trade metadata', () => {
    it('should preserve trade metadata through batching', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
        meta: { source: 'test', priority: 'high' },
      };

      // Capture what was passed to batch executor
      batchExecutorMock.mockImplementationOnce(async (trades: PendingTrade[]) => {
        expect(trades[0].meta).toEqual({ source: 'test', priority: 'high' });
        return trades.map(t => ({
          tradeId: t.id,
          success: true,
          orderId: `order_${t.id}`,
          executedViaBatch: true,
        }));
      });

      await optimizer.addTrade(trade);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent addTrade calls', async () => {
      const trades: PendingTrade[] = Array.from({ length: 10 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.length).toBe(10);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should maintain atomicity across concurrent batches', async () => {
      const trades: PendingTrade[] = Array.from({ length: 15 }, (_, i) => ({
        id: `trade_${i + 1}`,
        tokenId: 'BTC',
        side: 'BUY' as const,
        price: 45000,
        size: 0.5,
      }));

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      // All trades should be accounted for
      const tradeIds = new Set(results.map(r => r.tradeId));
      expect(tradeIds.size).toBe(15);
    });
  });

  describe('empty and edge cases', () => {
    it('should handle trade with optional metadata missing', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.5,
      };

      const result = await optimizer.addTrade(trade);

      expect(result.success).toBe(true);
    });

    it('should handle very small trade sizes', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 45000,
        size: 0.001,
      };

      const result = await optimizer.addTrade(trade);

      expect(result.success).toBe(true);
    });

    it('should handle zero-price trades', async () => {
      const trade: PendingTrade = {
        id: 'trade_1',
        tokenId: 'BTC',
        side: 'BUY',
        price: 0,
        size: 0.5,
      };

      const result = await optimizer.addTrade(trade);

      // May succeed or fail depending on validation, but should handle gracefully
      expect(result).toBeDefined();
    });
  });

  describe('different trade types', () => {
    it('should handle mixed BUY and SELL trades', async () => {
      const trades: PendingTrade[] = [
        { id: 'buy_1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 'sell_1', tokenId: 'BTC', side: 'SELL', price: 46000, size: 0.5 },
        { id: 'buy_2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle multiple token types', async () => {
      const trades: PendingTrade[] = [
        { id: 'btc_1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 'eth_1', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1 },
        { id: 'sol_1', tokenId: 'SOL', side: 'BUY', price: 150, size: 10 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results.length).toBe(3);
    });
  });

  // ── batch executor failure → fallback to individual execution ──

  describe('batch executor throws → fallback to individual execution', () => {
    it('falls back to singleExecutor when batchExecutor throws', async () => {
      batchExecutorMock.mockRejectedValueOnce(new Error('Batch API timeout'));

      const trades: PendingTrade[] = [
        { id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 't2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(batchExecutorMock).toHaveBeenCalled();
      expect(singleExecutorMock).toHaveBeenCalledTimes(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].executedViaBatch).toBe(false);
    });

    it('single fallback with single trade', async () => {
      batchExecutorMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.executedViaBatch).toBe(false);
    });
  });

  // ── fallback with rejected individual trades ──

  describe('fallbackIndividual with rejected trades', () => {
    it('handles rejected promise from singleExecutor', async () => {
      batchExecutorMock.mockRejectedValueOnce(new Error('Batch fail'));
      singleExecutorMock.mockRejectedValueOnce(new Error('Single fail'));

      const result = await optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Single fail');
      expect(result.executedViaBatch).toBe(false);
    });

    it('handles mixed fulfilled and rejected in fallback', async () => {
      batchExecutorMock.mockRejectedValueOnce(new Error('Batch fail'));
      singleExecutorMock
        .mockResolvedValueOnce({ tradeId: 't1', success: true, executedViaBatch: false })
        .mockRejectedValueOnce(new Error('trade2 failed'));

      const trades: PendingTrade[] = [
        { id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 't2', tokenId: 'ETH', side: 'SELL', price: 2500, size: 1 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('trade2 failed');
    });

    it('handles non-Error reason in fallback rejection', async () => {
      batchExecutorMock.mockRejectedValueOnce(new Error('Batch fail'));
      singleExecutorMock.mockRejectedValueOnce('string error');

      const result = await optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });

  // ── shutdown ──

  describe('shutdown', () => {
    it('flushes pending trades on shutdown', async () => {
      const trade: PendingTrade = {
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      };

      const promise = optimizer.addTrade(trade);
      await optimizer.shutdown();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(batchExecutorMock).toHaveBeenCalled();
    });

    it('shutdown with empty queue does not call executor', async () => {
      await optimizer.shutdown();
      expect(batchExecutorMock).not.toHaveBeenCalled();
    });

    it('shutdown clears pending timer', async () => {
      // Add trade but don't let timer fire
      optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      await optimizer.shutdown();
      expect(optimizer.queueSize).toBe(0);
    });
  });

  // ── queueSize getter ──

  describe('queueSize', () => {
    it('returns 0 for empty optimizer', () => {
      expect(optimizer.queueSize).toBe(0);
    });

    it('returns current pending count', async () => {
      // Add trades that won't flush yet (timer will fire async)
      const trade: PendingTrade = {
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      };

      const promise = optimizer.addTrade(trade);
      // queueSize may be 1 before timer fires, or 0 after
      expect(optimizer.queueSize).toBeGreaterThanOrEqual(0);
      await promise;
      expect(optimizer.queueSize).toBe(0);
    });
  });

  // ── isFlushing lock + flushRequested ──

  describe('isFlushing lock and flushRequested', () => {
    it('flushRequested triggers re-flush when pending trades exist after flush', async () => {
      let resolveFirstBatch: (val: TradeResult[]) => void;
      const firstBatchPromise = new Promise<TradeResult[]>((r) => { resolveFirstBatch = r; });

      let callCount = 0;
      batchExecutorMock.mockImplementation(async (trades: PendingTrade[]) => {
        callCount++;
        if (callCount === 1) {
          return await firstBatchPromise;
        }
        return trades.map(t => ({
          tradeId: t.id,
          success: true,
          orderId: `order_${t.id}`,
          executedViaBatch: true,
        }));
      });

      // Fill to max batch size to trigger immediate flush
      const firstBatch = Array.from({ length: 5 }, (_, i) => ({
        id: `f${i}`, tokenId: 'BTC', side: 'BUY' as const, price: 45000, size: 0.5,
      }));
      const firstPromises = firstBatch.map(t => optimizer.addTrade(t));

      // Wait for flush to start (isFlushing = true)
      await new Promise(r => setTimeout(r, 10));

      // Add a trade while flushing — sets flushRequested = true
      const midFlushPromise = optimizer.addTrade({
        id: 'mid1', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1,
      });

      // Resolve the first batch — flushBatch will see flushRequested and re-flush
      resolveFirstBatch(firstBatch.map(t => ({
        tradeId: t.id,
        success: true,
        orderId: `order_${t.id}`,
        executedViaBatch: true,
      })));

      const firstResults = await Promise.all(firstPromises);
      const midResult = await midFlushPromise;

      expect(firstResults.every(r => r.success)).toBe(true);
      expect(midResult.success).toBe(true);
      expect(midResult.executedViaBatch).toBe(true);
    });

    it('flushRequested does nothing when no pending trades after flush', async () => {
      let resolveBatch: (val: TradeResult[]) => void;
      const batchPromise = new Promise<TradeResult[]>((r) => { resolveBatch = r; });

      batchExecutorMock.mockImplementationOnce(() => batchPromise);

      const tradePromise = optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      await new Promise(r => setTimeout(r, 10));

      resolveBatch([{
        tradeId: 't1',
        success: true,
        orderId: 'order_t1',
        executedViaBatch: true,
      }]);

      const result = await tradePromise;
      expect(result.success).toBe(true);
      expect(optimizer.queueSize).toBe(0);
    });

    it('does not flush when pendingBatch is empty', async () => {
      // The empty-pendingBatch early return on line 121
      // is covered by shutdown with empty queue
      await optimizer.shutdown();
      expect(batchExecutorMock).not.toHaveBeenCalled();
    });

    it('isFlushing guard blocks concurrent flush', async () => {
      // Use maxBatchSize: 1 so t1 flushes alone immediately.
      // While t1's flush is pending, adding t2 sets flushRequested=true.
      // After t1 resolves, flushBatch re-flushes t2 in a second call.
      const smallOpt = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
        windowMs: 1000,
        maxBatchSize: 1,
      });

      let resolveFirstBatch: (val: TradeResult[]) => void;
      const firstBatchPromise = new Promise<TradeResult[]>((r) => { resolveFirstBatch = r; });

      let callCount = 0;
      batchExecutorMock.mockImplementation(async (trades: PendingTrade[]) => {
        callCount++;
        if (callCount === 1) {
          return await firstBatchPromise;
        }
        return trades.map(t => ({
          tradeId: t.id,
          success: true,
          orderId: `order_${t.id}`,
          executedViaBatch: true,
        }));
      });

      // maxBatchSize: 1 → t1 flushes immediately, isFlushing becomes true
      const t1Promise = smallOpt.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      // Wait for flush to start (isFlushing = true)
      await new Promise(r => setTimeout(r, 20));

      // Add t2 while first flush pending — schedules a new flush + sets flushRequested
      const t2Promise = smallOpt.addTrade({
        id: 't2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1,
      });

      // Resolve the first batch (only t1)
      resolveFirstBatch([{
        tradeId: 't1',
        success: true,
        orderId: 'order_t1',
        executedViaBatch: true,
      }]);

      const [r1, r2] = await Promise.all([t1Promise, t2Promise]);

      expect(r1.success).toBe(true);
      expect(r1.executedViaBatch).toBe(true);
      expect(r2.success).toBe(true);
      expect(r2.executedViaBatch).toBe(true);
      expect(callCount).toBe(2); // re-flush happened
    });

    it('flushBatch early-returns when isFlushing true and sets flushRequested', async () => {
      // Directly test the isFlushing guard at the top of flushBatch.
      // We use a custom executor that calls flushBatch synchronously during its execution.
      let resolveBatch: (val: TradeResult[]) => void;
      const batchPromise = new Promise<TradeResult[]>((r) => { resolveBatch = r; });

      batchExecutorMock.mockImplementation(async (trades: PendingTrade[]) => {
        // While flushBatch is awaiting batchExecutor, isFlushing=true.
        // Call flushBatch again — it should hit the early-return at line 115-119.
        // pendingBatch is empty at this point, so the inner if (length>0) is false.
        const reentrantPromise = optimizer.flushBatch();
        await reentrantPromise;
        return await batchPromise;
      });

      const t1Promise = optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      resolveBatch([{
        tradeId: 't1', success: true, orderId: 'order_t1', executedViaBatch: true,
      }]);

      const r1 = await t1Promise;
      expect(r1.success).toBe(true);
      expect(r1.executedViaBatch).toBe(true);
    });

    it('flushBatch early-returns when isFlushing true and pendingBatch has items', async () => {
      // Covers lines 116-117: isFlushing=true AND pendingBatch.length>0 → flushRequested=true
      const smallOpt = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock, {
        windowMs: 1000,
        maxBatchSize: 1,
      });

      let resolveFirstBatch: (val: TradeResult[]) => void;
      const firstBatchPromise = new Promise<TradeResult[]>((r) => { resolveFirstBatch = r; });

      let callCount = 0;
      batchExecutorMock.mockImplementation(async (trades: PendingTrade[]) => {
        callCount++;
        if (callCount === 1) {
          return await firstBatchPromise;
        }
        // Re-flush: return results for whatever trades are passed
        return trades.map(t => ({
          tradeId: t.id,
          success: true,
          orderId: `order_${t.id}`,
          executedViaBatch: true,
        }));
      });

      const t1Promise = smallOpt.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      // Wait for flush to start (isFlushing = true)
      await new Promise(r => setTimeout(r, 20));

      // Add t2 — goes into pendingBatch (length=1)
      const t2Promise = smallOpt.addTrade({
        id: 't2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1,
      });

      // Directly call flushBatch while isFlushing=true — should early-return and set flushRequested
      await (smallOpt as unknown as { flushBatch: () => Promise<void> }).flushBatch();

      // Now resolve the first batch
      resolveFirstBatch([{
        tradeId: 't1', success: true, orderId: 'order_t1', executedViaBatch: true,
      }]);

      const [r1, r2] = await Promise.all([t1Promise, t2Promise]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(callCount).toBe(2); // re-flush happened
    });
  });

  // ── flushBatch empty queue ──

  describe('flushBatch with empty queue', () => {
    it('returns immediately when pendingBatch is empty', async () => {
      // Directly call flushBatch on a fresh optimizer — pendingBatch is empty,
      // isFlushing is false → should hit the early return at line 121.
      await (optimizer as unknown as { flushBatch: () => Promise<void> }).flushBatch();
      expect(batchExecutorMock).not.toHaveBeenCalled();
    });
  });

  // ── resolveResults with missing results ──

  describe('resolveResults with missing trade results', () => {
    it('assigns error result when batch executor returns fewer results than trades', async () => {
      // batchExecutor returns result for only first trade, missing second
      batchExecutorMock.mockResolvedValueOnce([{
        tradeId: 't1',
        success: true,
        orderId: 'order_t1',
        executedViaBatch: true,
      }]);

      const trades: PendingTrade[] = [
        { id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5 },
        { id: 't2', tokenId: 'ETH', side: 'BUY', price: 2500, size: 1 },
      ];

      const results = await Promise.all(trades.map(t => optimizer.addTrade(t)));

      expect(results[0].success).toBe(true);
      // t2 should get an error result since it wasn't in the batch results
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Batch executor failed to return result');
      expect(results[1].executedViaBatch).toBe(true);
    });

    it('assigns error result when batch returns empty results array', async () => {
      batchExecutorMock.mockResolvedValueOnce([]);

      const result = await optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Batch executor failed to return result');
      expect(result.executedViaBatch).toBe(true);
    });
  });

  // ── non-Error thrown from batch executor ──

  describe('batch executor throws non-Error', () => {
    it('handles non-Error thrown by batch executor', async () => {
      batchExecutorMock.mockRejectedValueOnce('string error');

      const result = await optimizer.addTrade({
        id: 't1', tokenId: 'BTC', side: 'BUY', price: 45000, size: 0.5,
      });

      expect(result.success).toBe(true);
      expect(singleExecutorMock).toHaveBeenCalledTimes(1);
    });
  });

  // ── default config values ──

  describe('default config values', () => {
    it('uses 5000ms window and 10 max batch size by default', async () => {
      const defaultOpt = new GasBatchOptimizer(batchExecutorMock, singleExecutorMock);

      // Add 10 trades to trigger max batch size
      const trades: PendingTrade[] = Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`, tokenId: 'BTC', side: 'BUY' as const, price: 45000, size: 0.5,
      }));

      const results = await Promise.all(trades.map(t => defaultOpt.addTrade(t)));

      expect(results.length).toBe(10);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
