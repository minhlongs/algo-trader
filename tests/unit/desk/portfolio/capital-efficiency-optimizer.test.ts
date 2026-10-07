import { describe, it, expect } from 'vitest';
import { CapitalEfficiencyOptimizer } from '../../../../src/desk/portfolio/capital-efficiency-optimizer';
import type { VenueCollateralInfo } from '../../../../src/desk/portfolio/capital-efficiency-types';

describe('CapitalEfficiencyOptimizer', () => {
  it('correctly detects balanced allocations with no rebalance needed', () => {
    const optimizer = new CapitalEfficiencyOptimizer(50);
    const venues: VenueCollateralInfo[] = [
      { venue: 'POLYMARKET', availableUsd: 5000, lockedMarginUsd: 5000, totalEquityUsd: 10000, targetAllocationPct: 0.50 },
      { venue: 'KALSHI', availableUsd: 5000, lockedMarginUsd: 5000, totalEquityUsd: 10000, targetAllocationPct: 0.50 },
    ];

    const report = optimizer.optimizeAllocations(venues);
    expect(report.totalPortfolioEquityUsd).toBe(20000);
    expect(report.totalIdleCapitalUsd).toBe(10000);
    expect(report.overallMarginUtilizationPct).toBe(50);
    expect(report.recommendations.length).toBe(0);
  });

  it('generates rebalance transfers when allocation deviation exceeds threshold', () => {
    const optimizer = new CapitalEfficiencyOptimizer(50);
    // Total Equity: 20,000. Target 50% each: 10,000
    // Venue A has 15,000 (surplus 5,000, available 10,000)
    // Venue B has 5,000 (deficit 5,000)
    const venues: VenueCollateralInfo[] = [
      { venue: 'POLYMARKET', availableUsd: 10000, lockedMarginUsd: 5000, totalEquityUsd: 15000, targetAllocationPct: 0.50 },
      { venue: 'KALSHI', availableUsd: 1000, lockedMarginUsd: 4000, totalEquityUsd: 5000, targetAllocationPct: 0.50 },
    ];

    const report = optimizer.optimizeAllocations(venues);
    expect(report.recommendations.length).toBe(1);
    expect(report.recommendations[0].fromVenue).toBe('POLYMARKET');
    expect(report.recommendations[0].toVenue).toBe('KALSHI');
    expect(report.recommendations[0].transferAmountUsd).toBe(5000);
  });
});
