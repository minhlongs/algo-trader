import { describe, expect, it } from 'vitest';
import {
  computeCanonicalEconomicPnL,
  DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE,
  type EconomicPnLInput,
} from '../../src/desk/polymarket/economic-truth-pnl';

function baseInput(overrides: Partial<EconomicPnLInput> = {}): EconomicPnLInput {
  return {
    initialCapitalPusd: 10_000,
    pusdBalance: 8_200,
    executableBidValuePusd: 2_350,
    grossClosedTradingPnlPusd: 600,
    grossSettledPnlPusd: 420,
    settledRedemptionCostPusd: 5,
    makerRebatesPusd: 40,
    liquidityRewardsPusd: 120,
    realizedFeesPusd: 35,
    estimatedFeesPusd: 10,
    slippagePusd: 25,
    relayerGasPusd: 8,
    inferenceCostPusd: 12,
    infraCostPusd: 20,
    lockedCapitalPusd: 4_000,
    weightedAvgLockupDays: 10,
    umaDisputeLockupDays: 2,
    ...overrides,
  };
}

describe('computeCanonicalEconomicPnL', () => {
  it('strictly separates all 5 IC canonical PnL and return quantities', () => {
    const res = computeCanonicalEconomicPnL(baseInput());

    // 1. MTM PnL = pUSD + Executable Bid Value - initialCapital
    expect(res.mtmPnlPusd).toBe(550);
    // 2. Realized Trading PnL = grossClosed - realizedFees - slippage
    expect(res.realizedTradingPnlPusd).toBe(540);
    // 3. Settled PnL = grossSettled - settledRedemptionCost
    expect(res.settledPnlPusd).toBe(415);

    // Opportunity cost (4.5%/yr) & UMA dispute lockup cost
    const expectedOpp = 4_000 * DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE * (10 / 365);
    const expectedUma = 4_000 * DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE * (2 / 365);
    expect(res.costs.opportunityCostPusd).toBeCloseTo(expectedOpp, 4);
    expect(res.costs.umaDisputeLockupCostPusd).toBeCloseTo(expectedUma, 4);

    const expectedTotalCosts = 35 + 10 + 25 + 8 + 12 + 20 + expectedOpp + expectedUma;
    expect(res.costs.totalCostsPusd).toBeCloseTo(expectedTotalCosts, 4);

    // Net Economic PnL vs Ex-Rewards PnL (includes disjoint hold-to-resolution settledPnlPusd)
    const expectedNet = 600 + 415 + 40 + 120 - expectedTotalCosts;
    const expectedExRewards = 600 + 415 + 40 - expectedTotalCosts;
    expect(res.netEconomicPnlPusd).toBeCloseTo(expectedNet, 4);
    expect(res.netEconomicPnlExRewardsPusd).toBeCloseTo(expectedExRewards, 4);
    expect(res.netEconomicPnlPusd - res.netEconomicPnlExRewardsPusd).toBeCloseTo(120, 4);
    expect(res.isRewardsDependent).toBe(false);

    // 4. Capital-adjusted return (%)
    expect(res.capitalAdjustedReturnPct).toBeCloseTo((expectedNet / 10_000) * 100, 4);
    // 5. Annualized ROC on capital tied up (10d + 2d UMA buffer = 12d)
    expect(res.effectiveLockupDays).toBe(12);
    expect(res.returnOnCapitalTiedUpPct).toBeCloseTo(
      (expectedNet / 4_000) * (365 / 12) * 100,
      3,
    );
  });

  it('flags rewards-dependent strategy when netEconomicPnlPusd > 0 but ex-rewards <= 0', () => {
    const res = computeCanonicalEconomicPnL(
      baseInput({
        grossClosedTradingPnlPusd: 80,
        grossSettledPnlPusd: 0,
        settledRedemptionCostPusd: 0,
        makerRebatesPusd: 10,
        liquidityRewardsPusd: 150,
      }),
    );
    expect(res.netEconomicPnlPusd).toBeGreaterThan(0);
    expect(res.netEconomicPnlExRewardsPusd).toBeLessThanOrEqual(0);
    expect(res.isRewardsDependent).toBe(true);
  });

  it('supports explicit totalAllocatedCapitalPusd and cost overrides', () => {
    const res = computeCanonicalEconomicPnL(
      baseInput({
        totalAllocatedCapitalPusd: 20_000,
        opportunityCostPusd: 15,
        umaDisputeLockupCostPusd: 5,
      }),
    );
    expect(res.costs.opportunityCostPusd).toBe(15);
    expect(res.costs.umaDisputeLockupCostPusd).toBe(5);
    expect(res.costs.totalCostsPusd).toBe(130);
    expect(res.netEconomicPnlPusd).toBe(1045);
    expect(res.capitalAdjustedReturnPct).toBeCloseTo((1045 / 20_000) * 100, 4);
  });

  it('returns 0 ROC when lockedCapitalPusd or effectiveLockupDays is 0', () => {
    const res = computeCanonicalEconomicPnL(
      baseInput({ lockedCapitalPusd: 0, weightedAvgLockupDays: 0, umaDisputeLockupDays: 0 }),
    );
    expect(res.returnOnCapitalTiedUpPct).toBe(0);
    expect(res.costs.opportunityCostPusd).toBe(0);
    expect(res.costs.umaDisputeLockupCostPusd).toBe(0);
  });

  it('rejects negative costs or non-finite inputs fail-closed', () => {
    expect(() => computeCanonicalEconomicPnL(baseInput({ slippagePusd: -1 }))).toThrow(RangeError);
    expect(() => computeCanonicalEconomicPnL(baseInput({ pusdBalance: Number.NaN }))).toThrow(RangeError);
  });
});
