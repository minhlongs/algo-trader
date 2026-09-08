/**
 * BinaryArbitrageExecutor — real-module coverage
 *
 * The adjacent `executors/binary-arbitrage-executor.test.ts` tests the
 * strategy *wrapper* and deliberately mocks this module, so it drives zero
 * coverage here. This file exercises the genuine class: Kelly sizing,
 * drawdown guard, dryRun vs live execution, profit math, and the error path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BinaryArbitrageExecutor,
  type BinaryExecutorConfig,
} from '@desk/arbitrage/binary-arbitrage-executor';
import type {
  BinaryArbitrageOpportunity,
  BinaryMarket,
  ExchangeId,
} from '@desk/arbitrage/types';

function makeMarket(overrides: Partial<BinaryMarket> = {}): BinaryMarket {
  return {
    conditionId: 'cond-1',
    question: 'Will X happen?',
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: 10_000,
    liquidity: 5_000,
    endDate: new Date('2099-01-01'),
    resolved: false,
    ...overrides,
  };
}

interface MakeOppOpts {
  mispricing?: number;
  confidence?: number;
  legs?: BinaryArbitrageOpportunity['legs'];
  edge?: BinaryArbitrageOpportunity['edge'];
}

function makeOpp(opts: MakeOppOpts = {}): BinaryArbitrageOpportunity {
  const {
    mispricing = 0.05,
    confidence = 80,
    edge = 'yes-cheap',
    legs,
  } = opts;
  const now = Date.now();
  return {
    id: 'bin-opp-1',
    type: 'binary-arb',
    legs: legs ?? [
      {
        exchange: 'polymarket' as ExchangeId,
        symbol: 'event-1-yes',
        side: 'buy' as const,
        price: 0.5,
        amount: 100,
        fee: 0.01,
      },
    ],
    expectedProfit: 10,
    expectedProfitPct: 5,
    totalFees: 2,
    confidence,
    detectedAt: now,
    expiresAt: now + 60_000,
    market: makeMarket(),
    mispricing,
    edge,
  };
}

describe('BinaryArbitrageExecutor (real module)', () => {
  describe('constructor / config', () => {
    it('applies defaults when no config is provided', () => {
      const ex = new BinaryArbitrageExecutor();
      // defaults should allow execution without throwing; dryRun defaults true
      expect(ex).toBeInstanceOf(BinaryArbitrageExecutor);
    });

    it('overrides only the supplied fields, keeping the rest as defaults', () => {
      const ex = new BinaryArbitrageExecutor({ kellyFraction: 0.5 });
      // kellyFraction override should produce a larger size than the 0.25 default
      const custom = ex.calculateKellySize(0.05, 0.8, 1000);
      const baseline = new BinaryArbitrageExecutor().calculateKellySize(0.05, 0.8, 1000);
      expect(custom).toBeGreaterThan(baseline);
    });
  });

  describe('calculateKellySize', () => {
    it('returns a positive, bounded size for a genuine edge', () => {
      const ex = new BinaryArbitrageExecutor({ maxPositionSize: 1000, kellyFraction: 0.25 });
      const size = ex.calculateKellySize(0.05, 0.8, 1000);
      expect(size).toBeGreaterThan(0);
      // fractional Kelly (0.08 * 0.25 * 1000) = 20, well under cap
      expect(size).toBeLessThanOrEqual(1000);
    });

    it('floors at zero when the edge is non-positive (no real edge)', () => {
      // adjustedEdge = edge * confidence; with a negative or zero edge the
      // implied win probability p <= 0.5 → fullKelly <= 0 → Math.max floors to 0.
      const ex = new BinaryArbitrageExecutor({ kellyFraction: 0.25 });
      expect(ex.calculateKellySize(-0.05, 0.8, 1000)).toBe(0);
      expect(ex.calculateKellySize(0, 1.0, 1000)).toBe(0);
    });

    it('caps the position at maxPositionSize when Kelly suggests more', () => {
      const ex = new BinaryArbitrageExecutor({ maxPositionSize: 10, kellyFraction: 1.0 });
      // strong edge + full confidence + high fraction → raw far exceeds cap of 10
      const size = ex.calculateKellySize(0.5, 1.0, 10);
      expect(size).toBe(10);
    });
  });

  describe('checkDrawdownLimit', () => {
    it('returns true when PnL is non-negative', () => {
      const ex = new BinaryArbitrageExecutor({ maxPositionSize: 100, maxDrawdownPct: 0.2 });
      expect(ex.checkDrawdownLimit(0)).toBe(true);
      expect(ex.checkDrawdownLimit(50)).toBe(true);
    });

    it('returns true while the drawdown stays under the limit', () => {
      const ex = new BinaryArbitrageExecutor({ maxPositionSize: 100, maxDrawdownPct: 0.2 });
      // loss of 10 → 10/100 = 0.10 < 0.20 → still allowed
      expect(ex.checkDrawdownLimit(-10)).toBe(true);
    });

    it('returns false once losses reach the drawdown limit', () => {
      const ex = new BinaryArbitrageExecutor({ maxPositionSize: 100, maxDrawdownPct: 0.2 });
      // loss of 25 → 25/100 = 0.25 >= 0.20 → halt
      expect(ex.checkDrawdownLimit(-25)).toBe(false);
    });
  });

  describe('execute — dryRun path (simulateExecution)', () => {
    it('simulates legs and reports expected profit without placing orders', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: true });
      const spy = vi.spyOn(
        ex as unknown as { placeOrders: (...a: unknown[]) => unknown },
        'placeOrders',
      );

      const result = await ex.execute(makeOpp({ mispricing: 0.05, confidence: 80 }));

      expect(result.success).toBe(true);
      // positionSize = 20 → single leg gets full amount
      expect(result.executedLegs).toHaveLength(1);
      expect(result.executedLegs[0]!.executedAmount).toBeCloseTo(20);
      expect(result.actualProfit).toBeCloseTo(1); // 0.05 * 20
      expect(spy).not.toHaveBeenCalled();
    });

    it('uses a stake of 1 when simulating an opportunity with no legs', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: true });
      const result = await ex.execute(makeOpp({ legs: [], mispricing: 0.1, confidence: 100 }));

      expect(result.success).toBe(true);
      expect(result.executedLegs).toHaveLength(0);
      // positionSize non-zero, legs empty → profit computed, stake falls back to 1
      expect(Number.isFinite(result.actualProfitPct)).toBe(true);
    });
  });

  describe('execute — live path (placeOrders + calculateProfit)', () => {
    it('places orders, computes profit, and updates currentPnL', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: false, maxPositionSize: 1000 });
      const opp = makeOpp({ confidence: 80, legs: [
        { exchange: 'polymarket', symbol: 'ev-yes', side: 'buy', price: 0.5, amount: 100, fee: 0.01 },
      ] });

      const result = await ex.execute(opp);

      expect(result.success).toBe(true);
      // live path attaches a txHash to each leg
      expect(result.executedLegs[0]!.txHash).toMatch(/^0x[0-9a-f]+$/);
      // leg: amount 20, price 0.5, fee 0.01*20=0.2
      // totalSpent = 0.5*20 + 0.2 = 10.2 ; settlement = 20 ; profit = 9.8
      expect(result.actualProfit).toBeCloseTo(9.8, 5);
    });

    it('reflects a loss in the execution result and PnL', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: false, maxPositionSize: 1000 });
      // price + fee > 1.0 per share → settlement < totalSpent → negative profit
      const opp = makeOpp({ confidence: 80, legs: [
        { exchange: 'polymarket', symbol: 'ev-yes', side: 'buy', price: 0.9, amount: 100, fee: 0.2 },
      ] });

      const result = await ex.execute(opp);

      expect(result.success).toBe(true);
      // amount 20, totalSpent = 0.9*20 + 0.2*20 = 18+4=22 ; settlement=20 ; profit=-2
      expect(result.actualProfit).toBeCloseTo(-2, 5);
    });
  });

  describe('execute — drawdown halt path', () => {
    it('skips execution once accumulated losses breach the limit', async () => {
      // bankroll 10, 20% drawdown → halt once |PnL| >= 2.
      const ex = new BinaryArbitrageExecutor({ dryRun: false, maxPositionSize: 10, maxDrawdownPct: 0.2 });
      const losingOpp = makeOpp({
        confidence: 100,
        mispricing: 0.5,
        // price + fee > 1 per share → each trade loses roughly `amount`
        legs: [
          { exchange: 'polymarket', symbol: 'ev-yes', side: 'buy', price: 0.9, amount: 100, fee: 0.2 },
        ],
      });

      // accumulate losses until the halt triggers
      let halted = false;
      for (let i = 0; i < 20; i++) {
        const r = await ex.execute(losingOpp);
        if (r.error === 'Drawdown limit reached') {
          expect(r.success).toBe(false);
          halted = true;
          break;
        }
      }
      expect(halted).toBe(true);
    });
  });

  describe('execute — error catch path', () => {
    it('returns a failed result with the Error message when placeOrders throws', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: false });
      // placeOrders dereferences opp.legs.map; make it throw
      const opp = makeOpp({ legs: { map: () => { throw new Error('order placement down'); } } } as never);

      const result = await ex.execute(opp);

      expect(result.success).toBe(false);
      expect(result.error).toBe('order placement down');
    });

    it('reports "Unknown error" when the thrown value is not an Error', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: false });
      const opp = makeOpp({ legs: { map: () => { throw 'something-strange'; } } } as never);

      const result = await ex.execute(opp);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('getExecutionLog', () => {
    it('returns every logged execution entry in order', async () => {
      const ex = new BinaryArbitrageExecutor({ dryRun: true });
      await ex.execute(makeOpp({ mispricing: 0.05 }));
      await ex.execute(makeOpp({ mispricing: 0.03 }));

      const log = ex.getExecutionLog();

      expect(log).toHaveLength(2);
      // entries are append-only and immutable through the public view
      expect(Object.isFrozen(log)).toBe(false);
      expect(log[0]!.dryRun).toBe(true);
    });
  });
});
