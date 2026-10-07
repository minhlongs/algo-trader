import { describe, it, expect } from 'vitest';
import { SyntheticMarginLendingCalculator } from '../../../../src/desk/portfolio/synthetic-margin-lending-calculator';

describe('SyntheticMarginLendingCalculator', () => {
  it('recognizes zero-risk paired binary contracts for portfolio margin', () => {
    const calc = new SyntheticMarginLendingCalculator(0.50);

    // Fully paired position: 100 YES @ 0.60, 100 NO @ 0.40 -> Guaranteed $1 payout, 0 unhedged
    const result = calc.calculatePortfolioMargin({
      marketId: 'm-hedged',
      yesQuantity: 100,
      noQuantity: 100,
      yesPrice: 0.60,
      noPrice: 0.40,
    });

    expect(result.pairedOffsetQuantity).toBe(100);
    expect(result.unhedgedNotionalUsd).toBe(0);
    expect(result.requiredMaintenanceMarginUsd).toBe(0);
    expect(result.capitalEfficiencyRatio).toBe(Infinity);
  });

  it('correctly calculates margin on partially unhedged positions', () => {
    const calc = new SyntheticMarginLendingCalculator(0.50);

    // 150 YES @ 0.60, 100 NO @ 0.40 -> 50 unhedged YES @ 0.60 = $30 unhedged notional
    // Required maintenance margin = 30 * 0.50 = $15
    const result = calc.calculatePortfolioMargin({
      marketId: 'm-unhedged',
      yesQuantity: 150,
      noQuantity: 100,
      yesPrice: 0.60,
      noPrice: 0.40,
    });

    expect(result.pairedOffsetQuantity).toBe(100);
    expect(result.unhedgedNotionalUsd).toBe(30);
    expect(result.requiredMaintenanceMarginUsd).toBe(15);
  });

  it('calculates continuous annualized borrowing interest', () => {
    const calc = new SyntheticMarginLendingCalculator();

    // $10,000 borrowed at 10% APR for 36.5 days = $10,000 * 0.10 * (36.5 / 365) = $100
    const accrual = calc.calculateBorrowInterest(10000, 10, 36.5);
    expect(accrual.accruedInterestUsd).toBe(100);
  });
});
