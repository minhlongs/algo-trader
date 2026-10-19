/**
 * Multi-Leg Basket Tests
 * Covers: validateILPResult, createBasket, buildValidatedBasket, formatBasketSummary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILPResult, ILPSolverConfig } from '../../../shared/types/ilp-types';

const mockLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

function makeConfig(overrides: Partial<ILPSolverConfig> = {}): ILPSolverConfig {
  return { budgetUsdc: 100, maxMarketExposureFraction: 0.2, minEdgeThreshold: 0.025, feeRate: 0.02, timeoutMs: 500, ...overrides };
}

function makeResult(overrides: Partial<ILPResult> = {}): ILPResult {
  return {
    positions: [{ marketId: 'm1', side: 'YES', size: 50, expectedProfit: 5 }],
    totalExpectedProfit: 5,
    totalCost: 50,
    feasible: true,
    solveTimeMs: 10,
    ...overrides,
  };
}

describe('multi-leg-basket', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('validateILPResult', () => {
    it('returns valid for a correct result', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult(), makeConfig());
      expect(r.valid).toBe(true);
      expect(r.reasons).toHaveLength(0);
    });

    it('rejects infeasible ILP, empty positions, cost exceeding budget, and zero profit', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const rInfeasible = validateILPResult(makeResult({ feasible: false }), makeConfig());
      expect(rInfeasible.valid).toBe(false);
      expect(rInfeasible.reasons[0]).toContain('infeasible');

      const rEmpty = validateILPResult(makeResult({ positions: [] }), makeConfig());
      expect(rEmpty.valid).toBe(false);
      expect(rEmpty.reasons[0]).toContain('No positions');

      const rCost = validateILPResult(makeResult({ totalCost: 200 }), makeConfig({ budgetUsdc: 100 }));
      expect(rCost.valid).toBe(false);
      expect(rCost.reasons[0]).toContain('exceeds budget');

      const rProfit = validateILPResult(makeResult({ totalExpectedProfit: 0 }), makeConfig());
      expect(rProfit.valid).toBe(false);
      expect(rProfit.reasons[0]).toContain('non-positive');
    });

    it('rejects positions with non-positive expected profit or near-zero size and collects multiple reasons', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const badProfitPos = [
        { marketId: 'm1', side: 'YES' as const, size: 50, expectedProfit: 5 },
        { marketId: 'm2', side: 'NO' as const, size: 30, expectedProfit: 0 },
      ];
      const r1 = validateILPResult(makeResult({ positions: badProfitPos, totalExpectedProfit: 5, totalCost: 80 }), makeConfig());
      expect(r1.valid).toBe(false);
      expect(r1.reasons[0]).toContain('non-positive expected profit');

      const smallPos = [
        { marketId: 'm1', side: 'YES' as const, size: 50, expectedProfit: 5 },
        { marketId: 'm2', side: 'NO' as const, size: 0.005, expectedProfit: 1 },
      ];
      const r2 = validateILPResult(makeResult({ positions: smallPos, totalExpectedProfit: 6, totalCost: 50.005 }), makeConfig());
      expect(r2.valid).toBe(false);
      expect(r2.reasons[0]).toContain('near-zero size');

      const rMulti = validateILPResult(makeResult({ feasible: false, positions: [] }), makeConfig());
      expect(rMulti.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('createBasket', () => {
    it('creates basket with filtered positions, validated flag, and debug log', async () => {
      const { createBasket } = await import('../multi-leg-basket');
      const positions = [
        { marketId: 'm1', side: 'YES' as const, size: 50, expectedProfit: 5 },
        { marketId: 'm2', side: 'NO' as const, size: 0.005, expectedProfit: 1 },
      ];
      const basket = createBasket(makeResult({ positions, totalCost: 50.005 }), true);
      expect(basket.id).toBeDefined();
      expect(basket.positions).toHaveLength(1);
      expect(basket.positions[0].marketId).toBe('m1');
      expect(basket.validated).toBe(true);
      expect(basket.totalExpectedProfit).toBe(5);
      expect(basket.totalCost).toBe(50);
      expect(mockLogger.debug).toHaveBeenCalled();

      expect(createBasket(makeResult(), false).validated).toBe(false);
    });
  });

  describe('buildValidatedBasket', () => {
    it('returns basket when validation passes and null when validation fails', async () => {
      const { buildValidatedBasket } = await import('../multi-leg-basket');
      const basket = buildValidatedBasket(makeResult(), makeConfig());
      expect(basket).not.toBeNull();
      expect(basket!.validated).toBe(true);

      const invalid = buildValidatedBasket(makeResult({ feasible: false }), makeConfig());
      expect(invalid).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('formatBasketSummary', () => {
    it('returns formatted string with leg details', async () => {
      const { createBasket, formatBasketSummary } = await import('../multi-leg-basket');
      const basket = createBasket(makeResult({
        positions: [
          { marketId: '0xabc', side: 'YES', size: 40, expectedProfit: 4 },
          { marketId: '0xdef', side: 'NO', size: 60, expectedProfit: 3 },
        ],
        totalExpectedProfit: 7,
        totalCost: 100,
      }), true);
      const summary = formatBasketSummary(basket);
      expect(summary).toContain('Basket[');
      expect(summary).toContain('profit=');
      expect(summary).toContain('legs=[');
      expect(summary).toContain('0xabc:YES@40.00');
      expect(summary).toContain('0xdef:NO@60.00');
    });
  });
});
