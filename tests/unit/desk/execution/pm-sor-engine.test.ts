import { describe, it, expect } from 'vitest';
import { PmSmartOrderRouter } from '../../../../src/desk/execution/pm-sor-engine';
import type { VenueBookSnapshot } from '../../../../src/desk/execution/pm-sor-types';

describe('PmSmartOrderRouter', () => {
  const router = new PmSmartOrderRouter();

  it('routes BUY orders greedily to lowest effective ask price across venues', () => {
    const books: VenueBookSnapshot[] = [
      {
        venue: 'POLYMARKET',
        marketId: 'poly-1',
        outcome: 'YES',
        feeRate: 0.001,
        bids: [{ price: 0.48, quantity: 1000 }],
        asks: [
          { price: 0.50, quantity: 500 },
          { price: 0.52, quantity: 1000 },
        ],
      },
      {
        venue: 'KALSHI',
        marketId: 'kalshi-1',
        outcome: 'YES',
        feeRate: 0.002,
        bids: [{ price: 0.49, quantity: 1000 }],
        asks: [
          { price: 0.49, quantity: 300 },
          { price: 0.53, quantity: 1000 },
        ],
      },
    ];

    const plan = router.optimizeRoute({
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 600,
      books,
    });

    expect(plan.filledQuantity).toBe(600);
    expect(plan.allocations.length).toBe(2);

    // First 300 from Kalshi at 0.49 (effective ~0.49098)
    expect(plan.allocations[0].venue).toBe('KALSHI');
    expect(plan.allocations[0].allocatedQuantity).toBe(300);

    // Remaining 300 from Polymarket at 0.50 (effective ~0.5005)
    expect(plan.allocations[1].venue).toBe('POLYMARKET');
    expect(plan.allocations[1].allocatedQuantity).toBe(300);

    expect(plan.averageEffectivePrice).toBeGreaterThan(0.49);
    expect(plan.averageEffectivePrice).toBeLessThan(0.51);
  });

  it('routes SELL orders greedily to highest effective bid price across venues', () => {
    const books: VenueBookSnapshot[] = [
      {
        venue: 'POLYMARKET',
        marketId: 'poly-1',
        outcome: 'YES',
        feeRate: 0.001,
        bids: [
          { price: 0.48, quantity: 400 },
          { price: 0.45, quantity: 1000 },
        ],
        asks: [],
      },
      {
        venue: 'LIMITLESS',
        marketId: 'lim-1',
        outcome: 'YES',
        feeRate: 0.01,
        bids: [
          { price: 0.50, quantity: 200 },
          { price: 0.46, quantity: 1000 },
        ],
        asks: [],
      },
    ];

    const plan = router.optimizeRoute({
      outcome: 'YES',
      action: 'SELL',
      targetQuantity: 500,
      books,
    });

    expect(plan.filledQuantity).toBe(500);
    // Limitless 0.50 * 0.99 = 0.495 > Polymarket 0.48 * 0.999 = 0.4795
    expect(plan.allocations[0].venue).toBe('LIMITLESS');
    expect(plan.allocations[0].allocatedQuantity).toBe(200);

    expect(plan.allocations[1].venue).toBe('POLYMARKET');
    expect(plan.allocations[1].allocatedQuantity).toBe(300);
  });

  it('flags shouldSlice and calculates recommended slices when target quantity exceeds top depth ratio', () => {
    const books: VenueBookSnapshot[] = [
      {
        venue: 'POLYMARKET',
        marketId: 'poly-1',
        outcome: 'YES',
        feeRate: 0.001,
        bids: [],
        asks: [
          { price: 0.50, quantity: 200 },
          { price: 0.52, quantity: 2000 },
        ],
      },
    ];

    const plan = router.optimizeRoute({
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 1000,
      books,
    });

    expect(plan.shouldSlice).toBe(true);
    expect(plan.recommendedSlices).toBeGreaterThan(1);
    expect(plan.filledQuantity).toBe(1000);
  });

  it('handles edge cases: zero quantity, empty books, zero/invalid prices, and partial fills', () => {
    // Zero target quantity
    const zeroPlan = router.optimizeRoute({
      outcome: 'NO',
      action: 'BUY',
      targetQuantity: 0,
      books: [],
    });
    expect(zeroPlan.filledQuantity).toBe(0);
    expect(zeroPlan.allocations.length).toBe(0);
    expect(zeroPlan.averageEffectivePrice).toBe(0);

    // Invalid book levels (zero qty, zero price, price >= 1)
    const badBooks: VenueBookSnapshot[] = [
      {
        venue: 'KALSHI',
        marketId: 'k-bad',
        outcome: 'YES',
        feeRate: 0.001,
        bids: [{ price: 0, quantity: 100 }, { price: 1.05, quantity: 100 }],
        asks: [{ price: 0.50, quantity: 0 }, { price: -0.2, quantity: 50 }],
      },
    ];
    const emptyPlan = router.optimizeRoute({
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 100,
      books: badBooks,
    });
    expect(emptyPlan.filledQuantity).toBe(0);

    // Partial fill when books run out of liquidity
    const limitedBooks: VenueBookSnapshot[] = [
      {
        venue: 'POLYMARKET',
        marketId: 'poly-limited',
        outcome: 'YES',
        feeRate: 0.001,
        bids: [],
        asks: [{ price: 0.40, quantity: 50 }],
      },
    ];
    const partialPlan = router.optimizeRoute({
      outcome: 'YES',
      action: 'BUY',
      targetQuantity: 200,
      books: limitedBooks,
    });
    expect(partialPlan.filledQuantity).toBe(50);
  });
});
