/**
 * Cross-Market Arbitrage Detector Tests
 * Covers: computeEdge, pricesToOpportunities, applyCorrelationPenalties,
 *         detectCrossMarketArbitrage (all branches)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockSolveILP } = vi.hoisted(() => ({
  mockSolveILP: vi.fn(),
}));

const { mockBuildValidatedBasket, mockFormatBasketSummary } = vi.hoisted(() => ({
  mockBuildValidatedBasket: vi.fn(),
  mockFormatBasketSummary: vi.fn(),
}));

const { mockBuildSolverConfig } = vi.hoisted(() => ({
  mockBuildSolverConfig: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../src/desk/arbitrage/integer-programming-solver', () => ({
  solveILP: mockSolveILP,
}));

vi.mock('../../../../src/desk/arbitrage/multi-leg-basket', () => ({
  buildValidatedBasket: mockBuildValidatedBasket,
  formatBasketSummary: mockFormatBasketSummary,
}));

vi.mock('../../../../src/desk/arbitrage/ilp-constraint-builder', () => ({
  buildSolverConfig: mockBuildSolverConfig,
}));

// ── Source import (after mocks) ──────────────────────────────────────────────

import { detectCrossMarketArbitrage, type MarketPrice } from '../../../../src/desk/arbitrage/cross-market-arbitrage-detector';
import { RelationType, type DependencyGraph } from '../../../../src/shared/types/semantic-relationships';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePrice(overrides: Partial<MarketPrice> = {}): MarketPrice {
  return {
    marketId: 'market-a',
    question: 'Test market A?',
    yesPrice: 0.45,
    noPrice: 0.50,
    liquidity: 10_000,
    ...overrides,
  };
}

function makeGraph(overrides: Partial<DependencyGraph> = {}): DependencyGraph {
  return {
    relationships: [],
    marketCount: 2,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeBasket(id = 'basket-1') {
  return {
    id,
    legs: [],
    totalCostUsdc: 100,
    expectedProfitUsdc: 10,
    expectedEdgePct: 0.05,
    riskScore: 0.2,
    validated: true,
    createdAt: Date.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildSolverConfig.mockReturnValue({
    budgetUsdc: 1000,
    maxLegs: 4,
    riskTolerance: 0.5,
  });
});

describe('detectCrossMarketArbitrage', () => {
  // ── Happy path: basket found ─────────────────────────────────────────────

  it('returns a basket when solver finds opportunities', () => {
    const prices = [makePrice()];
    const basket = makeBasket();

    mockSolveILP.mockReturnValue({ solveTimeMs: 50 });
    mockBuildValidatedBasket.mockReturnValue(basket);
    mockFormatBasketSummary.mockReturnValue('Basket summary');

    const result = detectCrossMarketArbitrage(prices, makeGraph());

    expect(result.basket).toEqual(basket);
    expect(result.opportunitiesScanned).toBe(1);
    expect(result.solveTimeMs).toBe(50);
    expect(mockSolveILP).toHaveBeenCalled();
    expect(mockBuildValidatedBasket).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Basket ready'),
      expect.any(Object)
    );
  });

  // ── Null basket path ─────────────────────────────────────────────────────

  it('returns null basket when solver finds no valid opportunities', () => {
    const prices = [makePrice()];

    mockSolveILP.mockReturnValue({ solveTimeMs: 30 });
    mockBuildValidatedBasket.mockReturnValue(null);

    const result = detectCrossMarketArbitrage(prices, makeGraph());

    expect(result.basket).toBeNull();
    expect(result.opportunitiesScanned).toBe(1);
    expect(result.solveTimeMs).toBe(30);
    expect(mockLogger.info).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('No valid basket')
    );
  });

  // ── Empty prices array ───────────────────────────────────────────────────

  it('handles empty prices array', () => {
    mockSolveILP.mockReturnValue({ solveTimeMs: 5 });
    mockBuildValidatedBasket.mockReturnValue(null);

    const result = detectCrossMarketArbitrage([], makeGraph());

    expect(result.basket).toBeNull();
    expect(result.opportunitiesScanned).toBe(0);
    expect(result.solveTimeMs).toBe(5);
  });

  // ── Multiple markets ─────────────────────────────────────────────────────

  it('passes all markets to solver and returns correct count', () => {
    const prices = [
      makePrice({ marketId: 'm1', question: 'Q1?', yesPrice: 0.45, noPrice: 0.50, liquidity: 5000 }),
      makePrice({ marketId: 'm2', question: 'Q2?', yesPrice: 0.60, noPrice: 0.35, liquidity: 8000 }),
      makePrice({ marketId: 'm3', question: 'Q3?', yesPrice: 0.90, noPrice: 0.08, liquidity: 15000 }),
    ];
    const basket = makeBasket();

    mockSolveILP.mockReturnValue({ solveTimeMs: 120 });
    mockBuildValidatedBasket.mockReturnValue(basket);
    mockFormatBasketSummary.mockReturnValue('3-leg basket');

    const result = detectCrossMarketArbitrage(prices, makeGraph({ marketCount: 3 }));

    expect(result.opportunitiesScanned).toBe(3);
    expect(result.basket).toEqual(basket);
  });

  // ── Config overrides forwarded ───────────────────────────────────────────

  it('forwards config overrides to buildSolverConfig', () => {
    const prices = [makePrice()];
    mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
    mockBuildValidatedBasket.mockReturnValue(null);

    detectCrossMarketArbitrage(prices, makeGraph(), { budgetUsdc: 5000 });

    expect(mockBuildSolverConfig).toHaveBeenCalledWith({ budgetUsdc: 5000 });
  });

  // ── Correlation penalties ────────────────────────────────────────────────

  describe('applyCorrelationPenalties (via integration)', () => {
    it('halves liquidity for markets in mutual exclusion pairs with confidence > 0.7', () => {
      const prices = [
        makePrice({ marketId: 'm1', liquidity: 10_000 }),
        makePrice({ marketId: 'm2', liquidity: 8000 }),
      ];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.MUTUAL_EXCLUSION,
            confidence: 0.85,
            reasoning: 'High confidence exclusion',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 20 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(5000);
      expect(opportunities[1].liquidity).toBe(4000);
    });

    it('does not halve liquidity for mutual exclusion with confidence <= 0.7', () => {
      const prices = [
        makePrice({ marketId: 'm1', liquidity: 10_000 }),
        makePrice({ marketId: 'm2', liquidity: 8000 }),
      ];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.MUTUAL_EXCLUSION,
            confidence: 0.7,
            reasoning: 'Borderline confidence',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 20 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(10_000);
      expect(opportunities[1].liquidity).toBe(8000);
    });

    it('does not halve liquidity for non-mutual-exclusion relationship types', () => {
      const prices = [
        makePrice({ marketId: 'm1', liquidity: 10_000 }),
        makePrice({ marketId: 'm2', liquidity: 8000 }),
      ];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.CAUSAL,
            confidence: 0.9,
            reasoning: 'Causal not exclusion',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 20 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(10_000);
      expect(opportunities[1].liquidity).toBe(8000);
    });

    it('does not halve liquidity when no relationships exist', () => {
      const prices = [
        makePrice({ marketId: 'm1', liquidity: 10_000 }),
      ];
      const graph = makeGraph({ relationships: [] });

      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(10_000);
    });

    it('only halves liquidity for markets in the exclusion set, not others', () => {
      const prices = [
        makePrice({ marketId: 'm1', liquidity: 10_000 }),
        makePrice({ marketId: 'm2', liquidity: 8000 }),
        makePrice({ marketId: 'm3', liquidity: 12_000 }),
      ];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.MUTUAL_EXCLUSION,
            confidence: 0.9,
            reasoning: 'Exclusion pair',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 20 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(5000);
      expect(opportunities[1].liquidity).toBe(4000);
      expect(opportunities[2].liquidity).toBe(12_000);
    });
  });

  // ── Edge computation (via opportunity fields) ────────────────────────────

  describe('edge computation (via pricesToOpportunities)', () => {
    it('computes positive edge when YES+NO < 1 - fee', () => {
      // Edge = 1 - 0.45 - 0.50 - 0.02 = 0.03
      const prices = [makePrice({ yesPrice: 0.45, noPrice: 0.50 })];
      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, makeGraph());

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].expectedEdge).toBeCloseTo(0.03, 10);
    });

    it('computes negative edge when YES+NO >= 1 - fee', () => {
      // Edge = 1 - 0.50 - 0.50 - 0.02 = -0.02
      const prices = [makePrice({ yesPrice: 0.50, noPrice: 0.50 })];
      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, makeGraph());

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].expectedEdge).toBeCloseTo(-0.02, 10);
    });

    it('computes edge for high-liquidity YES-heavy market', () => {
      // Edge = 1 - 0.95 - 0.03 - 0.02 = 0.0
      const prices = [makePrice({ yesPrice: 0.95, noPrice: 0.03, liquidity: 50_000 })];
      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, makeGraph());

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].expectedEdge).toBeCloseTo(0.0, 10);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles CORRELATED relationship type without penalty', () => {
      const prices = [makePrice({ marketId: 'm1', liquidity: 10_000 })];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.CORRELATED,
            confidence: 0.95,
            reasoning: 'Correlated markets',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(10_000);
    });

    it('handles CONDITIONAL relationship type without penalty', () => {
      const prices = [makePrice({ marketId: 'm1', liquidity: 10_000 })];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.CONDITIONAL,
            confidence: 0.9,
            reasoning: 'Conditional dependency',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      const opportunities = mockSolveILP.mock.calls[0][0];
      expect(opportunities[0].liquidity).toBe(10_000);
    });

    it('preserves marketId, question, yesPrice, noPrice in opportunities', () => {
      const prices = [makePrice({
        marketId: 'test-market',
        question: 'Will X happen?',
        yesPrice: 0.65,
        noPrice: 0.30,
        liquidity: 5000,
      })];

      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, makeGraph());

      const opp = mockSolveILP.mock.calls[0][0][0];
      expect(opp.marketId).toBe('test-market');
      expect(opp.question).toBe('Will X happen?');
      expect(opp.yesPrice).toBe(0.65);
      expect(opp.noPrice).toBe(0.30);
      expect(opp.liquidity).toBe(5000);
    });

    it('passes graph relationship count to logger', () => {
      const prices = [makePrice()];
      const graph = makeGraph({
        relationships: [
          {
            marketA: 'm1',
            marketB: 'm2',
            type: RelationType.MUTUAL_EXCLUSION,
            confidence: 0.8,
            reasoning: 'test',
          },
        ],
      });

      mockSolveILP.mockReturnValue({ solveTimeMs: 10 });
      mockBuildValidatedBasket.mockReturnValue(null);

      detectCrossMarketArbitrage(prices, graph);

      expect(mockLogger.info).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('Starting detection'),
        expect.objectContaining({ graphRelationships: 1 })
      );
    });
  });
});
