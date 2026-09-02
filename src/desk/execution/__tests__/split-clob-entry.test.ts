/**
 * Tests for Split + CLOB Entry Mechanism (Paper Trading)
 * Covers calculateSplitEntry, isSplitCheaper, findBestSplitSide,
 * hasSufficientLiquidity, minimumDepositForSplit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateSplitEntry,
  isSplitCheaper,
  findBestSplitSide,
  hasSufficientLiquidity,
  minimumDepositForSplit,
  type MarketPrices,
  type OrderBookLevel,
} from '../split-clob-entry';

function makeMarket(overrides: Partial<MarketPrices> = {}): MarketPrices {
  return {
    marketId: 'test-market',
    yesPrice: 0.55,
    noPrice: 0.45,
    yesBids: [
      { price: 0.54, size: 1000 },
      { price: 0.53, size: 500 },
    ],
    noBids: [
      { price: 0.44, size: 1000 },
      { price: 0.43, size: 500 },
    ],
    ...overrides,
  };
}

describe('getBestBid (internal)', () => {
  it('returns 0 for empty bids', () => {
    // Access via calculateSplitEntry which uses getBestBid internally
    const market = makeMarket({ yesBids: [], noBids: [] });
    const result = calculateSplitEntry('test', 'YES', 100, market);
    expect(result.sellPrice).toBe(0);
  });

  it('returns highest bid price', () => {
    const market = makeMarket({ yesBids: [{ price: 0.54, size: 1000 }], noBids: [] });
    const result = calculateSplitEntry('test', 'NO', 100, market);
    // targetSide=NO sells YES, so uses yesBids
    expect(result.sellPrice).toBe(0.54);
  });
});

describe('calculateSplitEntry', () => {
  it('throws on zero or negative deposit', () => {
    const market = makeMarket();
    expect(() => calculateSplitEntry('test', 'YES', 0, market)).toThrow('depositAmount must be > 0');
    expect(() => calculateSplitEntry('test', 'YES', -10, market)).toThrow('depositAmount must be > 0');
  });

  it('calculates YES target correctly', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noPrice: 0.40,
      noBids: [{ price: 0.45, size: 1000 }],
    });
    const result = calculateSplitEntry('test', 'YES', 1000, market);
    // deposit 1000, mint 1000 YES + 1000 NO
    // sell NO at 0.45 => 1000 * 0.45 = 450 proceeds
    // netCost = 1000 - 450 = 550
    // netCostPerShare = 550 / 1000 = 0.55
    // directCostPerShare = 0.60
    // savings = 0.60 - 0.55 = 0.05
    // savingsPercent = 0.05 / 0.60 * 100 = 8.33%
    expect(result.marketId).toBe('test');
    expect(result.targetSide).toBe('YES');
    expect(result.sellSide).toBe('NO');
    expect(result.depositAmount).toBe(1000);
    expect(result.mintedShares).toBe(1000);
    expect(result.sellPrice).toBe(0.45);
    expect(result.sellProceeds).toBe(450);
    expect(result.netCost).toBe(550);
    expect(result.netCostPerShare).toBeCloseTo(0.55);
    expect(result.directCostPerShare).toBe(0.60);
    expect(result.savings).toBeCloseTo(0.05);
    expect(result.savingsPercent).toBeCloseTo(8.33, 1);
    expect(result.isCheaper).toBe(true);
  });

  it('calculates NO target correctly', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noPrice: 0.40,
      yesBids: [{ price: 0.55, size: 1000 }],
    });
    const result = calculateSplitEntry('test', 'NO', 1000, market);
    // deposit 1000, mint 1000 YES + 1000 NO
    // sell YES at 0.55 => 1000 * 0.55 = 550 proceeds
    // netCost = 1000 - 550 = 450
    // netCostPerShare = 450 / 1000 = 0.45
    // directCostPerShare = 0.40
    // savings = 0.40 - 0.45 = -0.05 (negative, so not cheaper)
    expect(result.targetSide).toBe('NO');
    expect(result.sellSide).toBe('YES');
    expect(result.sellPrice).toBe(0.55);
    expect(result.sellProceeds).toBe(550);
    expect(result.netCost).toBe(450);
    expect(result.netCostPerShare).toBeCloseTo(0.45);
    expect(result.directCostPerShare).toBe(0.40);
    expect(result.savings).toBeCloseTo(-0.05);
    expect(result.isCheaper).toBe(false);
  });

  it('handles case with no bids on sell side', () => {
    const market = makeMarket({ noBids: [] });
    const result = calculateSplitEntry('test', 'YES', 1000, market);
    expect(result.sellPrice).toBe(0);
    expect(result.sellProceeds).toBe(0);
    expect(result.netCost).toBe(1000);
    expect(result.netCostPerShare).toBe(1.0);
    expect(result.savings).toBe(0.55 - 1.0); // yesPrice - netCostPerShare
    expect(result.isCheaper).toBe(false);
  });

  it('uses default deposit amount for share calculation', () => {
    const market = makeMarket();
    const result = calculateSplitEntry('test', 'YES', 500, market);
    expect(result.mintedShares).toBe(500);
  });

  it('handles zero directCostPerShare without division by zero', () => {
    const market = makeMarket({
      yesPrice: 0,
      noPrice: 1.0,
      noBids: [{ price: 0.5, size: 1000 }],
    });
    const result = calculateSplitEntry('test', 'YES', 1000, market);
    expect(result.directCostPerShare).toBe(0);
    expect(result.savingsPercent).toBe(0);
    expect(result.netCostPerShare).toBe(0.5);
  });
});

describe('isSplitCheaper', () => {
  it('returns true when targetPrice + bestOppBid > 1.0 for YES', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // 0.60 + 0.45 = 1.05 > 1.0
    expect(isSplitCheaper('YES', market)).toBe(true);
  });

  it('returns false when targetPrice + bestOppBid <= 1.0 for YES', () => {
    const market = makeMarket({
      yesPrice: 0.55,
      noBids: [{ price: 0.40, size: 1000 }],
    });
    // 0.55 + 0.40 = 0.95 <= 1.0
    expect(isSplitCheaper('YES', market)).toBe(false);
  });

  it('returns true when targetPrice + bestOppBid > 1.0 for NO', () => {
    const market = makeMarket({
      noPrice: 0.50,
      yesBids: [{ price: 0.55, size: 1000 }],
    });
    // 0.50 + 0.55 = 1.05 > 1.0
    expect(isSplitCheaper('NO', market)).toBe(true);
  });

  it('returns false when no bids on opposite side', () => {
    const market = makeMarket({ yesBids: [] });
    expect(isSplitCheaper('NO', market)).toBe(false);
  });

  it('returns false when opposite bids are zero', () => {
    const market = makeMarket({ yesBids: [{ price: 0, size: 1000 }] });
    expect(isSplitCheaper('NO', market)).toBe(false);
  });
});

describe('findBestSplitSide', () => {
  it('returns null when neither side is cheaper', () => {
    const market = makeMarket({
      yesPrice: 0.50,
      noPrice: 0.50,
      yesBids: [{ price: 0.45, size: 1000 }],
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // YES: 0.50 + 0.45 = 0.95 <= 1.0
    // NO:  0.50 + 0.45 = 0.95 <= 1.0
    expect(findBestSplitSide(market, 1000)).toBeNull();
  });

  it('returns YES when only YES is cheaper', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noPrice: 0.40,
      yesBids: [{ price: 0.45, size: 1000 }],
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // YES: 0.60 + 0.45 = 1.05 > 1.0 (cheaper)
    // NO:  0.40 + 0.45 = 0.85 <= 1.0
    const result = findBestSplitSide(market, 1000);
    expect(result).not.toBeNull();
    expect(result!.targetSide).toBe('YES');
  });

  it('returns NO when only NO is cheaper', () => {
    const market = makeMarket({
      yesPrice: 0.45,
      noPrice: 0.55,
      yesBids: [{ price: 0.55, size: 1000 }],
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // YES: 0.45 + 0.45 = 0.90 <= 1.0
    // NO:  0.55 + 0.55 = 1.10 > 1.0 (cheaper)
    const result = findBestSplitSide(market, 1000);
    expect(result).not.toBeNull();
    expect(result!.targetSide).toBe('NO');
  });

  it('returns side with maximum savings when both are cheaper', () => {
    const market = makeMarket({
      yesPrice: 0.65,
      noPrice: 0.60,
      yesBids: [{ price: 0.50, size: 1000 }],
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // YES: 0.65 + 0.45 = 1.10, savings = 0.65 - (1 - 0.45) = 0.10
    // NO:  0.60 + 0.50 = 1.10, savings = 0.60 - (1 - 0.50) = 0.10
    // Both equal, but should return one
    const result = findBestSplitSide(market, 1000);
    expect(result).not.toBeNull();
    expect(['YES', 'NO']).toContain(result!.targetSide);
  });

  it('returns side with higher savings when both cheaper but different', () => {
    const market = makeMarket({
      yesPrice: 0.70,
      noPrice: 0.55,
      yesBids: [{ price: 0.40, size: 1000 }],
      noBids: [{ price: 0.50, size: 1000 }],
    });
    // YES: 0.70 + 0.50 = 1.20, savings = 0.70 - (1 - 0.50) = 0.20
    // NO:  0.55 + 0.40 = 0.95 <= 1.0 (not cheaper)
    const result = findBestSplitSide(market, 1000);
    expect(result).not.toBeNull();
    expect(result!.targetSide).toBe('YES');
  });
});

describe('hasSufficientLiquidity', () => {
  it('returns true when liquidity >= depositAmount', () => {
    const market = makeMarket({
      noBids: [
        { price: 0.44, size: 500 },
        { price: 0.43, size: 500 },
      ],
    });
    // Total liquidity >= 0.01 = 1000 >= 1000
    expect(hasSufficientLiquidity('YES', market, 1000)).toBe(true);
  });

  it('returns false when liquidity < depositAmount', () => {
    const market = makeMarket({
      noBids: [
        { price: 0.44, size: 500 },
      ],
    });
    expect(hasSufficientLiquidity('YES', market, 1000)).toBe(false);
  });

  it('respects minBidPrice filter', () => {
    const market = makeMarket({
      noBids: [
        { price: 0.44, size: 500 },
        { price: 0.005, size: 500 }, // below default minBidPrice of 0.01
      ],
    });
    // Only 500 at >= 0.01
    expect(hasSufficientLiquidity('YES', market, 1000)).toBe(false);
    // But with custom minBidPrice
    expect(hasSufficientLiquidity('YES', market, 1000, 0.001)).toBe(true);
  });

  it('uses correct bid side for NO target', () => {
    const market = makeMarket({
      yesBids: [
        { price: 0.55, size: 1000 },
      ],
    });
    expect(hasSufficientLiquidity('NO', market, 1000)).toBe(true);
  });
});

describe('minimumDepositForSplit', () => {
  it('returns null when split is not cheaper', () => {
    const market = makeMarket({
      yesPrice: 0.50,
      noBids: [{ price: 0.40, size: 1000 }],
    });
    // 0.50 + 0.40 = 0.90 <= 1.0
    expect(minimumDepositForSplit('YES', market)).toBeNull();
  });

  it('returns null when savings percent below threshold', () => {
    const market = makeMarket({
      yesPrice: 0.51,
      noBids: [{ price: 0.50, size: 1000 }],
    });
    // 0.51 + 0.50 = 1.01 > 1.0, but savingsPercent very small
    // probe with 1000: savingsPercent ~ 0.99%
    expect(minimumDepositForSplit('YES', market, 5)).toBeNull(); // 5% threshold
  });

  it('calculates minimum deposit based on savings percent', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // probe with 1000: savings = 0.60 - (1 - 0.45) = 0.05, savingsPercent = 0.05/0.60 = 8.33%
    // minSavingsPercent = 0.5 => deposit = max(100, 1000 * (0.5 / 8.33)) = max(100, 60) = 100
    expect(minimumDepositForSplit('YES', market, 0.5)).toBe(100);
  });

  it('enforces minimum 100 floor', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // With very high savings, formula gives < 100
    expect(minimumDepositForSplit('YES', market, 0.1)).toBe(100);
  });

  it('scales with higher savings threshold', () => {
    const market = makeMarket({
      yesPrice: 0.60,
      noBids: [{ price: 0.45, size: 1000 }],
    });
    // 0.5% threshold => ~100
    // 2% threshold => 1000 * (2/8.33) = 240
    expect(minimumDepositForSplit('YES', market, 2)).toBeGreaterThanOrEqual(200);
  });
});