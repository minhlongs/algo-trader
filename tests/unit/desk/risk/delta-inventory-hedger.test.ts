import { describe, it, expect } from 'vitest';
import { DeltaInventoryHedger } from '../../../../src/desk/risk/delta-inventory-hedger';
import type { VenuePositionDelta } from '../../../../src/desk/risk/delta-inventory-hedger-types';

describe('DeltaInventoryHedger', () => {
  it('correctly assesses unbreached balanced delta exposure', () => {
    const hedger = new DeltaInventoryHedger({ maxNetDeltaUsd: 100 });

    const positions: VenuePositionDelta[] = [
      { venue: 'POLYMARKET', marketId: 'poly-1', outcome: 'YES', quantity: 100, currentProbability: 0.5 },
      { venue: 'KALSHI', marketId: 'kalshi-1', outcome: 'NO', quantity: 100, currentProbability: 0.5 },
    ];

    const assessment = hedger.assessPortfolio(positions);
    expect(assessment.isBreached).toBe(false);
    expect(assessment.totalNetDeltaUsd).toBe(0);
    expect(assessment.recommendedHedges.length).toBe(0);
  });

  it('detects delta breach and generates offsetting hedge order', () => {
    const hedger = new DeltaInventoryHedger({ maxNetDeltaUsd: 50, minHedgeNotionalUsd: 10 });

    // 200 YES contracts with p=0.6 -> +120 USD delta
    const positions: VenuePositionDelta[] = [
      { venue: 'POLYMARKET', marketId: 'poly-1', outcome: 'YES', quantity: 200, currentProbability: 0.6 },
    ];

    const assessment = hedger.assessPortfolio(positions, {
      venue: 'KALSHI',
      marketId: 'kalshi-hedge',
      currentProbability: 0.6,
    });

    expect(assessment.isBreached).toBe(true);
    expect(assessment.totalNetDeltaUsd).toBe(120);
    expect(assessment.recommendedHedges.length).toBe(1);

    const hedge = assessment.recommendedHedges[0];
    expect(hedge.targetVenue).toBe('KALSHI');
    expect(hedge.action).toBe('SELL');
    expect(hedge.outcome).toBe('YES');
    expect(hedge.quantity).toBe(200); // 120 / 0.6 = 200
  });
});
