import { describe, it, expect } from 'vitest';
import { MultiVenueArbitrageRouter } from '../../../../src/desk/arbitrage/multi-venue-arbitrage-router';
import type { ArbitrageVenueLeg } from '../../../../src/desk/arbitrage/multi-venue-arbitrage-types';

describe('MultiVenueArbitrageRouter', () => {
  it('detects profitable cross-venue arbitrage pairs', () => {
    const router = new MultiVenueArbitrageRouter(5.0);

    const buyLeg: ArbitrageVenueLeg = {
      venue: 'POLYMARKET',
      marketId: 'poly-1',
      outcome: 'YES',
      action: 'BUY',
      price: 0.40,
      availableQuantity: 500,
      feeRate: 0.002,
    };

    const sellLeg: ArbitrageVenueLeg = {
      venue: 'KALSHI',
      marketId: 'kalshi-1',
      outcome: 'YES',
      action: 'SELL',
      price: 0.50,
      availableQuantity: 300,
      feeRate: 0.005,
    };

    const opp = router.detectOpportunity('opp-1', buyLeg, sellLeg);
    expect(opp).not.toBeNull();
    expect(opp?.maxExecutableQuantity).toBe(300);
    expect(opp?.expectedProfitUsd).toBeGreaterThan(5.0);

    const executed = router.routeArbitrage(opp!);
    expect(executed.executedQuantity).toBe(300);
    expect(executed.netProfitUsd).toBeGreaterThan(5.0);
  });

  it('rejects arbitrage when price difference does not cover fees', () => {
    const router = new MultiVenueArbitrageRouter(5.0);

    const buyLeg: ArbitrageVenueLeg = {
      venue: 'POLYMARKET',
      marketId: 'poly-2',
      outcome: 'YES',
      action: 'BUY',
      price: 0.50,
      availableQuantity: 100,
      feeRate: 0.02,
    };

    const sellLeg: ArbitrageVenueLeg = {
      venue: 'KALSHI',
      marketId: 'kalshi-2',
      outcome: 'YES',
      action: 'SELL',
      price: 0.505,
      availableQuantity: 100,
      feeRate: 0.02,
    };

    const opp = router.detectOpportunity('opp-2', buyLeg, sellLeg);
    expect(opp).toBeNull();
  });
});
