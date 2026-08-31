/**
 * Delta-Neutral Volatility Arbitrage Strategy — Unit Tests
 *
 * Covers the public surface of DeltaNeutralVolatilityArbitrage:
 * initializeFromGraph (pair filtering, missing-price skip, open + monitor
 * start), updatePrices delegation, stop delegation, and the getPortfolios
 * snapshot.
 *
 * DeltaNeutralPortfolioMonitor and computePortfolioDelta are mocked so the
 * strategy's branching (eligibility filter, price lookup, emit) is exercised
 * without the monitor's real setInterval loop or rebalance engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const monitorStartMock = vi.hoisted(() => vi.fn());
const monitorStopMock = vi.hoisted(() => vi.fn());
const monitorUpdatePricesMock = vi.hoisted(() => vi.fn());

vi.mock('../delta-neutral-portfolio-monitor', () => ({
  DeltaNeutralPortfolioMonitor: class {
    start = monitorStartMock;
    stop = monitorStopMock;
    updatePrices = monitorUpdatePricesMock;
  },
}));

const computePortfolioDeltaMock = vi.hoisted(() =>
  vi.fn<[import('../../../shared/types/delta-neutral-types').HedgePosition[], number], import('../../../shared/types/delta-neutral-types').PortfolioDeltaResult>(),
);

vi.mock('../delta-calculator', () => ({
  computePortfolioDelta: computePortfolioDeltaMock,
}));

import { DeltaNeutralVolatilityArbitrage } from '../delta-neutral-volatility-arbitrage';
import {
  DependencyGraph,
  MarketRelationship,
  RelationType,
} from '../../../../shared/types/semantic-relationships';
import type { DeltaNeutralPortfolio } from '../../../../shared/types/delta-neutral-types';

function correlatedPair(overrides: Partial<MarketRelationship> = {}): MarketRelationship {
  return {
    marketA: 'm-yes',
    marketB: 'm-no',
    type: RelationType.CORRELATED,
    confidence: 0.85,
    reasoning: 'shared underlying event',
    ...overrides,
  };
}

function makeGraph(relationships: MarketRelationship[]): DependencyGraph {
  return { relationships, marketCount: relationships.length + 1, updatedAt: 1_700_000_000_000 };
}

const PRICES: Record<string, { yes: number; no: number }> = {
  'm-yes': { yes: 0.6, no: 0.4 },
  'm-no': { yes: 0.55, no: 0.45 },
};

describe('DeltaNeutralVolatilityArbitrage', () => {
  let strategy: DeltaNeutralVolatilityArbitrage;

  beforeEach(() => {
    vi.clearAllMocks();
    computePortfolioDeltaMock.mockReturnValue({
      netDelta: 0.02,
      positionDeltas: [],
      isNeutral: true,
    });
    strategy = new DeltaNeutralVolatilityArbitrage();
  });

  describe('initializeFromGraph', () => {
    it('opens a hedged pair for each eligible, priced, correlated relationship', () => {
      const openedSpy = vi.fn();
      strategy.on('position:opened', openedSpy);

      strategy.initializeFromGraph(makeGraph([correlatedPair()]), PRICES);

      const portfolios = strategy.getPortfolios();
      expect(portfolios).toHaveLength(1);
      expect(portfolios[0].id).toBe('m-yes:m-no');
      expect(portfolios[0].positions).toHaveLength(2);
      expect(portfolios[0].positions[0]).toMatchObject({ marketId: 'm-yes', side: 'YES' });
      expect(portfolios[0].positions[1]).toMatchObject({ marketId: 'm-no', side: 'NO' });
      expect(openedSpy).toHaveBeenCalledOnce();
      expect(monitorStartMock).toHaveBeenCalledOnce();
    });

    it('also accepts MUTUAL_EXCLUSION relationships', () => {
      strategy.initializeFromGraph(
        makeGraph([correlatedPair({ type: RelationType.MUTUAL_EXCLUSION })]),
        PRICES,
      );

      expect(strategy.getPortfolios()).toHaveLength(1);
    });

    it('skips relationships below the minimum confidence threshold', () => {
      strategy.initializeFromGraph(
        makeGraph([correlatedPair({ confidence: 0.3 })]),
        PRICES,
      );

      expect(strategy.getPortfolios()).toHaveLength(0);
      expect(monitorStartMock).toHaveBeenCalledOnce();
    });

    it('skips non-qualifying relationship types (CAUSAL, CONDITIONAL)', () => {
      strategy.initializeFromGraph(
        makeGraph([
          correlatedPair({ type: RelationType.CAUSAL }),
          correlatedPair({ marketA: 'a', marketB: 'b', type: RelationType.CONDITIONAL }),
        ]),
        { a: { yes: 0.6, no: 0.4 }, b: { yes: 0.55, no: 0.45 } },
      );

      expect(strategy.getPortfolios()).toHaveLength(0);
    });

    it('skips a pair when prices are missing for one leg', () => {
      strategy.initializeFromGraph(
        makeGraph([correlatedPair()]),
      { 'm-yes': { yes: 0.6, no: 0.4 } }, // m-no missing
      );

      expect(strategy.getPortfolios()).toHaveLength(0);
    });

    it('opens multiple eligible pairs in one pass', () => {
      strategy.initializeFromGraph(
        makeGraph([
          correlatedPair({ marketA: 'm1', marketB: 'm2' }),
          correlatedPair({ marketA: 'm3', marketB: 'm4' }),
        ]),
        {
          m1: { yes: 0.6, no: 0.4 }, m2: { yes: 0.55, no: 0.45 },
          m3: { yes: 0.7, no: 0.3 }, m4: { yes: 0.5, no: 0.5 },
        },
      );

      expect(strategy.getPortfolios()).toHaveLength(2);
    });
  });

  describe('updatePrices / stop delegation', () => {
    it('delegates price updates to the monitor', () => {
      strategy.updatePrices('m-yes', 0.65, 0.35);

      expect(monitorUpdatePricesMock).toHaveBeenCalledWith('m-yes', 0.65, 0.35);
    });

    it('delegates stop to the monitor', () => {
      strategy.stop();

      expect(monitorStopMock).toHaveBeenCalledOnce();
    });
  });

  describe('getPortfolios', () => {
    it('returns an empty snapshot before initialization', () => {
      expect(strategy.getPortfolios()).toEqual([]);
    });

    it('returns a read-only snapshot of active portfolios', () => {
      strategy.initializeFromGraph(makeGraph([correlatedPair()]), PRICES);

      const snapshot = strategy.getPortfolios();

      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]).toMatchObject({ netDelta: 0.02, unrealizedPnl: 0 });
    });
  });
});
