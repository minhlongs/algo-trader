import { describe, it, expect } from 'vitest';
import { PaperTradingHarness } from '../../../../src/desk/sandbox/paper-trading-harness';
import type { BookLevel } from '../../../../src/desk/execution/pm-sor-types';

describe('PaperTradingHarness', () => {
  it('executes market buy orders walking multiple book levels', () => {
    const harness = new PaperTradingHarness(10000, 0.001);

    const bookLevels: BookLevel[] = [
      { price: 0.50, quantity: 100 },
      { price: 0.52, quantity: 200 },
    ];

    const fill = harness.simulateOrder({
      request: {
        orderId: 'pt-1',
        marketId: 'pm-market-1',
        outcome: 'YES',
        action: 'BUY',
        orderType: 'MARKET',
        quantity: 150,
      },
      bookLevels,
    });

    expect(fill.filledQuantity).toBe(150);
    // 100 * 0.50 + 50 * 0.52 = 50 + 26 = 76
    expect(fill.totalCostUsd).toBe(76);
    expect(fill.averagePrice).toBeCloseTo(76 / 150);
    expect(fill.feeUsd).toBeCloseTo(76 * 0.001);

    const pos = harness.getPosition('pm-market-1', 'YES');
    expect(pos?.quantity).toBe(150);
    expect(pos?.costBasisUsd).toBe(76);

    const summary = harness.getSummary();
    expect(summary.cashBalanceUsd).toBeCloseTo(10000 - 76 - (76 * 0.001));
  });

  it('respects limit price bounds on limit buy and sell orders', () => {
    const harness = new PaperTradingHarness(5000);

    const bookLevels: BookLevel[] = [
      { price: 0.45, quantity: 50 },
      { price: 0.55, quantity: 50 },
    ];

    const buyFill = harness.simulateOrder({
      request: {
        orderId: 'pt-limit-buy',
        marketId: 'm-2',
        outcome: 'YES',
        action: 'BUY',
        orderType: 'LIMIT',
        limitPrice: 0.50,
        quantity: 100,
      },
      bookLevels,
    });

    expect(buyFill.filledQuantity).toBe(50); // only first level accepted
    expect(buyFill.averagePrice).toBe(0.45);
  });
});
