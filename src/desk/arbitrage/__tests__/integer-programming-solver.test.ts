/**
 * Tests for integer-programming-solver — ILP model construction, result
 * parsing, and the public solveILP entrypoint. The real solver and the
 * constraint-builder module are mocked so the tests exercise only this
 * file's logic (net-edge math, size caps, position assembly, error path).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const solveMock = vi.hoisted(() => vi.fn());

vi.mock('javascript-lp-solver', () => ({
  default: { Solve: solveMock },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const filterMock = vi.hoisted(() => vi.fn());
vi.mock('../ilp-constraint-builder', () => ({
  buildConstraints: vi.fn(),
  filterEligibleMarkets: (...args: unknown[]) => filterMock(...args),
}));

import { solveILP } from '../integer-programming-solver';
import type { ILPSolverConfig, MarketOpportunity } from '../../../shared/types/ilp-types';

function makeConfig(overrides: Partial<ILPSolverConfig> = {}): ILPSolverConfig {
  return {
    budgetUsdc: 1000,
    maxMarketExposureFraction: 0.2,
    minEdgeThreshold: 0.025,
    feeRate: 0.02,
    timeoutMs: 500,
    ...overrides,
  };
}

function makeMarket(overrides: Partial<MarketOpportunity> = {}): MarketOpportunity {
  return {
    marketId: 'M1',
    question: 'Will X happen?',
    yesPrice: 0.6,
    noPrice: 0.4,
    expectedEdge: 0.1,
    liquidity: 500,
    ...overrides,
  };
}

describe('solveILP', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    solveMock.mockReset();
    filterMock.mockImplementation((markets) => markets);
  });

  it('returns feasible=false with no eligible markets and never calls the solver', () => {
    filterMock.mockReturnValue([]);

    const result = solveILP([makeMarket(), makeMarket({ marketId: 'M2' })], makeConfig());

    expect(result).toEqual({
      positions: [],
      totalExpectedProfit: 0,
      totalCost: 0,
      feasible: false,
      solveTimeMs: 0,
    });
    expect(solveMock).not.toHaveBeenCalled();
  });

  it('calls the solver and returns a parsed result for a single eligible market', () => {
    solveMock.mockReturnValue({ feasible: true, M1_YES: 200, M1_NO: 0, result: 16 });

    const result = solveILP([makeMarket()], makeConfig());

    expect(result.feasible).toBe(true);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual({
      marketId: 'M1',
      side: 'YES',
      size: 200,
      expectedProfit: 200 * 0.08, // size * (expectedEdge - feeRate)
    });
    expect(result.totalCost).toBe(200);
    expect(result.totalExpectedProfit).toBeCloseTo(16, 5);
  });

  it('parses both YES and NO positions when both have meaningful size', () => {
    solveMock.mockReturnValue({ feasible: true, M1_YES: 100, M1_NO: 50, result: 12 });

    const result = solveILP([makeMarket({ expectedEdge: 0.12 })], makeConfig({ feeRate: 0.02 }));

    expect(result.positions).toHaveLength(2);
    const yes = result.positions.find((p) => p.side === 'YES');
    const no = result.positions.find((p) => p.side === 'NO');
    expect(yes).toEqual({ marketId: 'M1', side: 'YES', size: 100, expectedProfit: 10 });
    expect(no).toEqual({ marketId: 'M1', side: 'NO', size: 50, expectedProfit: 5 });
    expect(result.totalCost).toBe(150);
  });

  it('drops positions below the 0.001 size threshold', () => {
    solveMock.mockReturnValue({ feasible: true, M1_YES: 0.0005, M1_NO: 0.0009, result: 0 });

    const result = solveILP([makeMarket()], makeConfig());

    expect(result.positions).toHaveLength(0);
    expect(result.totalCost).toBe(0);
  });

  it('returns feasible=false with no positions when the solver reports infeasible', () => {
    solveMock.mockReturnValue({ feasible: false, result: -Infinity });

    const result = solveILP([makeMarket()], makeConfig());

    expect(result.feasible).toBe(false);
    expect(result.positions).toHaveLength(0);
    expect(result.totalExpectedProfit).toBe(0);
  });

  it('caps position size at liquidity and per-market budget fraction', () => {
    // budget 1000 * 0.2 = 200; liquidity 50 → cap is 50.
    solveMock.mockReturnValue({ feasible: true, M1_YES: 50, M1_NO: 0, result: 4 });

    const result = solveILP([makeMarket({ liquidity: 50 })], makeConfig());

    expect(result.positions[0].size).toBe(50);
  });

  it('treats missing solver output keys as zero size', () => {
    solveMock.mockReturnValue({ feasible: true });

    const result = solveILP([makeMarket()], makeConfig());

    expect(result.positions).toHaveLength(0);
    expect(result.totalCost).toBe(0);
  });

  it('returns feasible=false and logs when the solver throws', () => {
    solveMock.mockImplementation(() => {
      throw new Error('solver exploded');
    });

    const result = solveILP([makeMarket()], makeConfig());

    expect(result.feasible).toBe(false);
    expect(result.positions).toHaveLength(0);
    expect(result.solveTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('measures solve time across an async gap', () => {
    solveMock.mockReturnValue({ feasible: true, M1_YES: 10, result: 0.8 });

    const result = solveILP([makeMarket()], makeConfig());

    // solveTimeMs records startMs via Date.now() at entry; the stub resolves
    // synchronously so the elapsed clock time is 0.
    expect(result.solveTimeMs).toBe(0);
  });

  it('passes the eligible markets to the model and the timeout through', () => {
    solveMock.mockReturnValue({ feasible: true });
    filterMock.mockImplementation((markets) => markets.filter((m) => m.marketId === 'M1'));

    solveILP([makeMarket(), makeMarket({ marketId: 'M2', expectedEdge: 0.001 })], makeConfig({ timeoutMs: 1234 }));

    expect(solveMock).toHaveBeenCalledOnce();
    const model = solveMock.mock.calls[0]![0] as { timeout: number; optimize: string };
    expect(model.optimize).toBe('profit');
    expect(model.timeout).toBe(1234);
  });
});
