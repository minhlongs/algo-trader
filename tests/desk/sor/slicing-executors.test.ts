import { describe, it, expect } from 'vitest';
import { TwapExecutor } from '../../../src/desk/sor/twap-executor';
import { VwapExecutor } from '../../../src/desk/sor/vwap-executor';
import { IcebergExecutor } from '../../../src/desk/sor/iceberg-executor';
import { RoutingPlan, RoutingRequest } from '../../../src/desk/sor/sor-types';

describe('Slicing Executors (TWAP, VWAP, Iceberg)', () => {
  const mockPlan = (req: RoutingRequest): RoutingPlan => ({
    routeId: 'mock-plan',
    symbol: req.symbol,
    side: req.side,
    totalQuantity: req.targetQuantity,
    allocations: [
      {
        venueId: 'binance',
        quantity: req.targetQuantity,
        limitPrice: 60000,
        feeUsd: 1.0,
        gasCostUsd: 0,
        effectivePrice: 60000,
        netProceedsOrCost: req.targetQuantity * 60000,
      },
    ],
    expectedEffectivePrice: 60000,
    expectedTotalFeeUsd: 1.0,
    expectedGasCostUsd: 0,
    expectedNetProceedsUsd: req.targetQuantity * 60000,
    priceImprovementBps: 5.0,
    timestamp: Date.now(),
  });

  describe('TwapExecutor', () => {
    const twap = new TwapExecutor();

    it('generates jittered slices summing exactly to totalQuantity', () => {
      const totalQty = 10.0;
      const slices = twap.sliceOrder(totalQty, 5, 1500); // 15% jitter

      expect(slices).toHaveLength(5);
      const sum = slices.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(totalQty, 5);

      // Verify jitter variance
      const base = totalQty / 5;
      for (const s of slices) {
        expect(s).toBeGreaterThanOrEqual(base * 0.7);
        expect(s).toBeLessThanOrEqual(base * 1.3);
      }
    });

    it('executes TWAP slices sequentially and terminates with COMPLETED status', async () => {
      const progressList: number[] = [];
      const res = await twap.executeTwap({
        request: { symbol: 'BTC/USDT', side: 'BUY', targetQuantity: 5.0, maxSlippageBps: 50, urgency: 'MEDIUM' },
        slices: 3,
        intervalMs: 5,
        routeSlice: async (sliceReq) => mockPlan(sliceReq),
        onProgress: (p) => progressList.push(p.completedSlices),
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.filledQuantity).toBeCloseTo(5.0, 4);
      expect(res.completedSlices).toBe(3);
      expect(progressList).toEqual([1, 2, 3]);
    });

    it('cancels mid-flight on abortSignal', async () => {
      const controller = new AbortController();
      let callCount = 0;

      const promise = twap.executeTwap({
        request: { symbol: 'BTC/USDT', side: 'BUY', targetQuantity: 10.0, maxSlippageBps: 50, urgency: 'MEDIUM' },
        slices: 5,
        intervalMs: 20,
        routeSlice: async (sliceReq) => {
          callCount++;
          if (callCount === 2) controller.abort();
          return mockPlan(sliceReq);
        },
        abortSignal: controller.signal,
      });

      const res = await promise;
      expect(res.status).toBe('CANCELLED');
      expect(res.completedSlices).toBeLessThan(5);
    });
  });

  describe('VwapExecutor', () => {
    const vwap = new VwapExecutor();

    it('slices order according to intraday volume profile', () => {
      const profile = [0.1, 0.2, 0.4, 0.2, 0.1];
      const slices = vwap.sliceOrder(100.0, profile);

      expect(slices).toHaveLength(5);
      expect(slices[0]).toBeCloseTo(10.0, 4);
      expect(slices[1]).toBeCloseTo(20.0, 4);
      expect(slices[2]).toBeCloseTo(40.0, 4);
      expect(slices.reduce((a, b) => a + b, 0)).toBeCloseTo(100.0, 5);
    });

    it('adapts slice size based on market volume surges or lulls', () => {
      const target = 10.0;
      // Surge: actual is 1500 vs expected 1000 -> pace accelerates
      const surgeSlice = vwap.adaptSlice(target, 1500, 1000, 0.4);
      expect(surgeSlice).toBeGreaterThan(target);

      // Lull: actual is 500 vs expected 1000 -> pace decelerates
      const lullSlice = vwap.adaptSlice(target, 500, 1000, 0.4);
      expect(lullSlice).toBeLessThan(target);
    });

    it('executes VWAP and completes full target quantity', async () => {
      const res = await vwap.executeVwap({
        request: { symbol: 'ETH/USDT', side: 'BUY', targetQuantity: 15.0, maxSlippageBps: 50, urgency: 'MEDIUM' },
        volumeProfile: [0.3, 0.4, 0.3],
        intervalMs: 5,
        routeSlice: async (sliceReq) => mockPlan(sliceReq),
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.filledQuantity).toBeCloseTo(15.0, 4);
      expect(res.remainingQuantity).toBe(0);
    });
  });

  describe('IcebergExecutor', () => {
    const iceberg = new IcebergExecutor();

    it('generates randomized display chunks and depletes hidden reserve', () => {
      const chunks = iceberg.sliceOrder(100.0, 0.20, 0.20);
      expect(chunks.length).toBeGreaterThanOrEqual(4);

      let totalVisible = 0;
      for (const c of chunks) {
        expect(c.visible).toBeGreaterThan(0);
        totalVisible += c.visible;
      }
      expect(totalVisible).toBeCloseTo(100.0, 4);
      expect(chunks[chunks.length - 1].hidden).toBe(0);
    });

    it('executes iceberg slices with randomized refills to completion', async () => {
      const res = await iceberg.executeIceberg({
        request: { symbol: 'SOL/USDT', side: 'SELL', targetQuantity: 20.0, maxSlippageBps: 50, urgency: 'LOW' },
        displayChunkRatio: 0.25,
        minDelayMs: 2,
        maxDelayMs: 5,
        routeSlice: async (sliceReq) => mockPlan(sliceReq),
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.filledQuantity).toBeCloseTo(20.0, 4);
      expect(res.completedSlices).toBeGreaterThanOrEqual(3);
    });
  });
});
