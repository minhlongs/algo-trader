import { describe, expect, it } from 'vitest';
import {
  AtomicBasketCoordinator, BasketPricer, CombinatorialScanner, CompensatoryUnwindHandler,
  MultiOutcomeMarket, MultiTokenPool, OrderbookSnapshot,
} from '../../../src/desk/amm';

const createMarket = (n: number): MultiOutcomeMarket => ({
  marketId: `mkt-${n}`, conditionId: `cond-${n}`, question: `Test Market ${n}`,
  outcomes: Array.from({ length: n }, (_, i) => ({ index: i, symbol: `O${i}`, name: `Outcome ${i}`, tokenId: `tok-${i}` })),
  collateralToken: 'USDC', resolutionTimeMs: Date.now() + 86400000, resolved: false,
});

describe('Milestone 2 — Combinatorial Negative-Risk & Arbitrage Execution Engine', () => {
  describe('CombinatorialScanner', () => {
    it('detects overpriced baskets across N = 2, 3, 5, 10 outcomes', () => {
      for (const n of [2, 3, 5, 10]) {
        const market = createMarket(n);
        const bids = new Array(n).fill(1.10 / n); const asks = new Array(n).fill(1.20 / n);
        const opp = CombinatorialScanner.scanBasket(market, 10, { bids, asks });
        expect(opp).not.toBeNull();
        expect(opp!.type).toBe('OVERPRICED_BASKET');
        expect(opp!.legs.length).toBe(n);
        expect(opp!.legs.every((l) => l.action === 'SELL')).toBe(true);
        expect(opp!.grossEdge).toBeCloseTo(0.10, 4);
        expect(opp!.netEdge).toBeGreaterThan(0);
      }
    });

    it('detects underpriced baskets across N = 2, 3, 5, 10 outcomes', () => {
      for (const n of [2, 3, 5, 10]) {
        const market = createMarket(n);
        const bids = new Array(n).fill(0.80 / n); const asks = new Array(n).fill(0.92 / n);
        const opp = CombinatorialScanner.scanBasket(market, 10, { bids, asks });
        expect(opp).not.toBeNull();
        expect(opp!.type).toBe('UNDERPRICED_BASKET');
        expect(opp!.legs.length).toBe(n);
        expect(opp!.legs.every((l) => l.action === 'BUY')).toBe(true);
        expect(opp!.grossEdge).toBeCloseTo(0.08, 4);
        expect(opp!.netEdge).toBeGreaterThan(0);
      }
    });

    it('detects mutually exclusive sub-basket mispricing in N >= 3 markets', () => {
      const market = createMarket(4);
      const bids = [0.55, 0.53, 0.01, 0.01]; const asks = [0.60, 0.58, 0.05, 0.05];
      const opps = CombinatorialScanner.scanAll(market, 10, { bids, asks });
      const subOpps = opps.filter((o) => o.type === 'SYNTHETIC_DISCREPANCY');
      expect(subOpps.length).toBeGreaterThanOrEqual(1);
      const subOpp2 = subOpps.find((o) => o.legs.length === 2);
      expect(subOpp2).toBeDefined();
      expect(subOpp2!.grossEdge).toBeCloseTo(0.08, 4);
    });

    it('returns null on fair / efficient markets where sum equals 1.00', () => {
      const market = createMarket(3);
      expect(CombinatorialScanner.scanBasket(market, 10, { bids: [0.32, 0.32, 0.32], asks: [0.34, 0.34, 0.34] })).toBeNull();
    });
  });

  describe('BasketPricer & Depth Walker', () => {
    it('prices opportunity with gas-cost netting and fee netting', () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.55, 0.55], asks: [0.6, 0.6] })!;
      const val = BasketPricer.priceOpportunity(opp, { fixedGasUsd: 0.05, takerFeeBps: 10, minProfitHurdleUsd: 0.1 });
      expect(val.isProfitable).toBe(true);
      expect(val.estimatedGasUsd).toBe(0.05);
      expect(val.expectedProfitUsd).toBeGreaterThan(0);
      expect(val.expectedRoi).toBeGreaterThan(0);
    });

    it('walks orderbook levels to determine maximum executable sets before edge collapse', () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.56, 0.56], asks: [0.6, 0.6] })!;
      const books = new Map<number, OrderbookSnapshot>([
        [0, { marketId: 'mkt-2', outcomeIndex: 0, timestampMs: Date.now(), bids: [{ price: 0.56, size: 50 }, { price: 0.51, size: 50 }], asks: [] }],
        [1, { marketId: 'mkt-2', outcomeIndex: 1, timestampMs: Date.now(), bids: [{ price: 0.56, size: 50 }, { price: 0.47, size: 50 }], asks: [] }],
      ]);
      const val = BasketPricer.priceOpportunity(opp, { fixedGasUsd: 0.02, takerFeeBps: 0 }, books);
      expect(val.optimalSets).toBeGreaterThan(0);
      expect(val.isProfitable).toBe(true);
      expect(val.vwapPrices.length).toBe(2);
    });

    it('rejects unprofitable baskets when gas or fees exceed edge', () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.505, 0.505], asks: [0.6, 0.6] })!;
      const val = BasketPricer.priceOpportunity(opp, { fixedGasUsd: 50.0, takerFeeBps: 200, minProfitHurdleUsd: 1.0 });
      expect(val.isProfitable).toBe(false);
      expect(val.expectedProfitUsd).toBeLessThan(0);
    });
  });

  describe('AtomicBasketCoordinator & CompensatoryUnwindHandler', () => {
    it('executes full bundle successfully in concurrent mode (FILLED state)', async () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(3), 0, { bids: [0.38, 0.38, 0.38], asks: [0.4, 0.4, 0.4] })!;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, { executionStrategy: 'concurrent' });
      expect(res.state).toBe('FILLED');
      expect(res.executedLegs.length).toBe(3);
      expect(res.executedLegs.every((l) => l.status === 'FILLED')).toBe(true);
      expect(res.realizedPnlUsd).toBeGreaterThan(0);
    });

    it('executes full bundle successfully in staged mode', async () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.55, 0.55], asks: [0.6, 0.6] })!;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, { executionStrategy: 'staged' });
      expect(res.state).toBe('FILLED');
      expect(res.executedLegs.length).toBe(2);
    });

    it('triggers compensatory unwind on partial fill and guarantees 0 net delta exposure', async () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.1, 0.1], asks: [0.45, 0.45] })!;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, {
        legExecutor: async (leg, size) => ({
          filledSize: leg.outcomeIndex === 0 ? size : 0, avgPrice: leg.price,
          status: leg.outcomeIndex === 0 ? 'FILLED' : 'FAILED',
        }),
      });
      expect(res.state).toBe('UNWOUND');
      expect(res.unwindResult?.completed).toBe(true);
      expect(res.unwindResult!.recoveredUsdc).toBeGreaterThan(0);
      expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(res.executedLegs)).toBe(true);
      expect(res.unwindResult!.residualDeltaExposure).toBe(0);
      expect(res.unwindResult!.netResidualPositions).toEqual([0, 0]);
    });

    it('executes genuine compensatory unwind against MultiTokenPool updating pool reserves', async () => {
      const pool = new MultiTokenPool({
        poolId: 'pool-test', conditionId: 'cond-2', pricingModel: 'LMSR', b: 500,
        outcomes: [
          { index: 0, symbol: 'O0', name: 'Outcome 0', tokenId: 'tok-0' },
          { index: 1, symbol: 'O1', name: 'Outcome 1', tokenId: 'tok-1' },
        ],
      });
      const initialReserves = [...pool.getReserves()];
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.1, 0.1], asks: [0.45, 0.45] })!;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, {
        pool,
        legExecutor: async (leg, size) => ({
          filledSize: leg.outcomeIndex === 0 ? size : 0, avgPrice: leg.price,
          status: leg.outcomeIndex === 0 ? 'FILLED' : 'FAILED',
        }),
      });
      expect(res.state).toBe('UNWOUND');
      expect(res.unwindResult?.completed).toBe(true);
      expect(pool.getReserves()[0]).not.toEqual(initialReserves[0]);
      expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(res.executedLegs)).toBe(true);
    });

    it('forwards unwindExecutor and calculates true residual loss on short sale unwinds', async () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.55, 0.55], asks: [0.6, 0.6] })!;
      let unwindCalled = false;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, {
        legExecutor: async (leg, size) => ({
          filledSize: leg.outcomeIndex === 0 ? size : 0, avgPrice: 0.55,
          status: leg.outcomeIndex === 0 ? 'FILLED' : 'FAILED',
        }),
        unwindExecutor: async (_idx, _act, size) => {
          unwindCalled = true;
          return { price: 0.56, filled: size };
        },
        takerFeeBps: 10,
      });
      expect(unwindCalled).toBe(true);
      expect(res.state).toBe('UNWOUND');
      expect(res.unwindResult!.residualLossUsd).toBeCloseTo(10.56, 1);
      expect(res.unwindResult!.residualLossUsd).toBeLessThan(20);
      expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(res.executedLegs)).toBe(true);
    });

    it('transitions to FAILED on unwind failure or invalid opportunity', async () => {
      const opp = CombinatorialScanner.scanBasket(createMarket(2), 0, { bids: [0.55, 0.55], asks: [0.6, 0.6] })!;
      const res = await AtomicBasketCoordinator.executeOpportunity(opp, {
        legExecutor: async (leg, size) => ({
          filledSize: leg.outcomeIndex === 0 ? size : 0, avgPrice: leg.price,
          status: leg.outcomeIndex === 0 ? 'FILLED' : 'FAILED',
        }),
        unwindExecutor: async () => ({ price: 0.56, filled: 0 }),
      });
      expect(res.state).toBe('FAILED');
      expect(res.unwindResult!.completed).toBe(false);

      const badRes = await AtomicBasketCoordinator.executeOpportunity({ ...opp, legs: [] });
      expect(badRes.state).toBe('FAILED');
    });

    it('verifies CompensatoryUnwindHandler merges matched sets when qMatched > 0', async () => {
      const legs = [
        { legIndex: 0, action: 'BUY' as const, targetSize: 100, filledSize: 100, avgFillPrice: 0.45, status: 'FILLED' as const },
        { legIndex: 1, action: 'BUY' as const, targetSize: 100, filledSize: 60, avgFillPrice: 0.45, status: 'PARTIAL' as const },
      ];
      const unwind = await CompensatoryUnwindHandler.unwindPartialFills(legs, {
        opportunityType: 'UNDERPRICED_BASKET',
      });
      expect(unwind.unwoundSets).toBe(60);
      expect(unwind.recoveredUsdc).toBeGreaterThanOrEqual(60);
      expect(unwind.completed).toBe(true);
      expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(unwind.netResidualPositions!)).toBe(true);
    });
  });
});
