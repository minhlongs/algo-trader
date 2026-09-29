import { describe, it, expect } from 'vitest';
import { SmartOrderRouter } from '../../../src/desk/sor/sor-router';
import { VenueBook, RoutingRequest, ExecutionProgress } from '../../../src/desk/sor/sor-types';

describe('SmartOrderRouter', () => {
  const sampleBinance: VenueBook = {
    venueId: 'binance',
    symbol: 'BTC/USDT',
    bids: [[60000, 5.0]],
    asks: [[60050, 2.0], [60150, 5.0]],
    takerFeeBps: 7.5,
    gasCostUsd: 0,
  };

  const sampleBybit: VenueBook = {
    venueId: 'bybit',
    symbol: 'BTC/USDT',
    bids: [[60010, 5.0]],
    asks: [[60040, 1.0], [60120, 5.0]],
    takerFeeBps: 10.0,
    gasCostUsd: 0,
  };

  it('throws an error if no liquidity books are registered for symbol', () => {
    const router = new SmartOrderRouter();
    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 1.0,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };
    expect(() => router.route(req)).toThrow(/no liquidity books available/);
  });

  it('routes order across aggregated venues with optimal price improvement', () => {
    const router = new SmartOrderRouter();
    router.registerBook(sampleBinance);
    router.registerBook(sampleBybit);

    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 2.5,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = router.route(req);
    expect(plan.allocations.length).toBeGreaterThan(1);
    expect(plan.totalQuantity).toBe(2.5);
    expect(plan.priceImprovementBps).toBeGreaterThan(0);
  });

  it('evaluates parent order splitting based on notional and depth', () => {
    const router = new SmartOrderRouter();
    router.registerBook(sampleBinance);
    router.registerBook(sampleBybit);

    // 0.05 BTC ($3,000) -> Below $5,000 and small relative to depth -> MARKET
    const smallReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.05,
      maxSlippageBps: 50,
      urgency: 'LOW',
    };
    const decisionSmall = router.evaluateSplitting(smallReq);
    expect(decisionSmall.shouldSplit).toBe(false);

    // 0.2 BTC ($12,000) with HIGH urgency -> TWAP
    const urgentReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.2,
      maxSlippageBps: 50,
      urgency: 'HIGH',
    };
    const decisionUrgent = router.evaluateSplitting(urgentReq);
    expect(decisionUrgent.shouldSplit).toBe(true);
    expect(decisionUrgent.recommendedStrategy).toBe('TWAP');
  });

  it('executes parent order through slicing execution workflow', async () => {
    const router = new SmartOrderRouter();
    router.registerBook(sampleBinance);
    router.registerBook(sampleBybit);

    // Large order triggering TWAP
    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.2,
      maxSlippageBps: 50,
      urgency: 'HIGH',
    };

    const res = await router.executeOrder({ request: req });
    // Should return ExecutionProgress
    const progress = res as ExecutionProgress;
    expect(progress.status).toBe('COMPLETED');
    expect(progress.filledQuantity).toBeCloseTo(0.2, 4);
    expect(progress.slices.length).toBeGreaterThan(1);
  });

  it('returns single RoutingPlan directly when splitting is not needed', async () => {
    const router = new SmartOrderRouter();
    router.registerBook(sampleBinance);
    router.registerBook(sampleBybit);

    const smallReq: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 0.05,
      maxSlippageBps: 50,
      urgency: 'LOW',
    };

    const res = await router.executeOrder({ request: smallReq });
    // Directly routed plan
    expect('routeId' in res).toBe(true);
    expect('allocations' in res).toBe(true);
  });
});
