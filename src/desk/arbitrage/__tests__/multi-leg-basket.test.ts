/**
 * Multi-Leg Basket Tests
 * Covers: validateILPResult, createBasket, buildValidatedBasket, formatBasketSummary.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILPResult, ILPSolverConfig } from '../../../shared/types/ilp-types';

const mockLogger = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('multi-leg-basket', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── validateILPResult ─────────────────────────────────────────────────────

  describe('validateILPResult', () => {
    it('returns valid for a correct result', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult(), makeConfig());
      expect(r.valid).toBe(true);
      expect(r.reasons).toHaveLength(0);
    });

    it('rejects infeasible ILP', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult({ feasible: false }), makeConfig());
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('infeasible');
    });

    it('rejects empty positions', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult({ positions: [] }), makeConfig());
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('No positions');
    });

    it('rejects cost exceeding budget', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult({ totalCost: 200 }), makeConfig({ budgetUsdc: 100 }));
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('exceeds budget');
    });

    it('rejects zero expected profit', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult({ totalExpectedProfit: 0 }), makeConfig());
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('non-positive');
    });

    it('rejects positions with non-positive expected profit', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const positions = [
        { marketId: 'm1', side: 'YES' as const, size: 50, expectedProfit: 5 },
        { marketId: 'm2', side: 'NO' as const, size: 30, expectedProfit: 0 },
      ];
      const r = validateILPResult(makeResult({ positions, totalExpectedProfit: 5, totalCost: 80 }), makeConfig());
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('non-positive expected profit');
    });

    it('rejects positions with near-zero size', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const positions = [
        { marketId: 'm1', side: 'YES' as const, size: 50, expectedProfit: 5 },
        { marketId: 'm2', side: 'NO' as const, size: 0.005, expectedProfit: 1 },
      ];
      const r = validateILPResult(makeResult({ positions, totalExpectedProfit: 6, totalCost: 50.005 }), makeConfig());
      expect(r.valid).toBe(false);
      expect(r.reasons[0]).toContain('near-zero size');
    });

    it('collects multiple reasons', async () => {
      const { validateILPResult } = await import('../multi-leg-basket');
      const r = validateILPResult(makeResult({ feasible: false, positions: [] }), makeConfig());
      expect(r.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── createBasket ──────────────────────────────────────────────────────────

  describe('createBasket', () => {
    it('creates basket with filtered positions and validated=true', async () => {
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
    });

    it('sets validated=false', async () => {
      const { createBasket } = await import('../multi-leg-basket');
      const basket = createBasket(makeResult(), false);
      expect(basket.validated).toBe(false);
    });

    it('logs debug with basket details', async () => {
      const { createBasket } = await import('../multi-leg-basket');
      createBasket(makeResult(), true);
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  // ── buildValidatedBasket ──────────────────────────────────────────────────

  describe('buildValidatedBasket', () => {
    it('returns basket when validation passes', async () => {
      const { buildValidatedBasket } = await import('../multi-leg-basket');
      const basket = buildValidatedBasket(makeResult(), makeConfig());
      expect(basket).not.toBeNull();
      expect(basket!.validated).toBe(true);
    });

    it('returns null when validation fails', async () => {
      const { buildValidatedBasket } = await import('../multi-leg-basket');
      const basket = buildValidatedBasket(makeResult({ feasible: false }), makeConfig());
      expect(basket).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ── formatBasketSummary ───────────────────────────────────────────────────

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
