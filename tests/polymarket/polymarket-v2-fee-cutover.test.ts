/**
 * CLOB V2 fee cutover coverage.
 *
 * The legacy linear `calcTakerFee` curve is retained for backwards-compatible
 * backtests, but every live signal-generation and paper-simulation path must
 * price on the CLOB V2 quadratic engine. These tests pin the two November 2026
 * categories, the quadratic rates themselves, the fee unit convention, and the
 * runtime callers that switched over.
 */

import { describe, it, expect } from 'vitest';
import {
  calcMakerRebateV2,
  calcQuadraticTakerFeeRateV2,
  calcQuadraticTakerFeeV2,
  classifyMarketCategory,
  computeTakerBuyNetSharesAndMergeablePairs,
  type PolymarketCategory,
} from '../../src/desk/polymarket/polymarket-fee-calculator';
import { sweepOrderBookLevels } from '../../src/desk/polymarket/paper-orderbook-simulator';
import { calculatePolymarketFee } from '../../src/desk/arbitrage/profitability/fee-calculator';

describe('CLOB V2 categories added in November 2026', () => {
  it('prices NFL & college football at rCat 0.03', () => {
    // Fee = C * r_cat * p * (1 - p) => 100 * 0.03 * 0.5 * 0.5 = 0.75 per 100 shares
    expect(calcQuadraticTakerFeeRateV2('nfl_college_football', 0.50)).toBe(0.0075);
    expect(calcQuadraticTakerFeeV2('nfl_college_football', 0.50, 100)).toBeCloseTo(0.75, 6);
  });

  it('credits the 15% maker rebate pool for NFL & college football', () => {
    expect(calcMakerRebateV2('nfl_college_football', 0.50, 100)).toBeCloseTo(0.1125, 6);
  });

  it('prices table tennis at rCat 0.10', () => {
    expect(calcQuadraticTakerFeeRateV2('table_tennis', 0.50)).toBe(0.025);
    expect(calcQuadraticTakerFeeV2('table_tennis', 0.50, 100)).toBeCloseTo(2.5, 6);
  });

  it('still charges table tennis away from mid, where the quadratic profile falls off', () => {
    // 0.10 * 0.10 * 0.90 = 0.009 => $0.90 per 100 shares at $0.10
    expect(calcQuadraticTakerFeeRateV2('table_tennis', 0.10)).toBeCloseTo(0.009, 6);
  });

  it('classifies football and table-tennis descriptions away from the generic sports bucket', () => {
    expect(classifyMarketCategory('NFL Chiefs vs Bills college football NCAAF')).toBe('nfl_college_football');
    expect(classifyMarketCategory('WTT table tennis ping pong finals')).toBe('table_tennis');
  });
});

describe('CLOB V2 quadratic rates', () => {
  it('returns pUSD (rate x contracts), not a USDC notional', () => {
    // 'crypto' at p=0.50: rate = 0.07 * 0.5 * 0.5 = 0.0175 => 1000 contracts = 17.5 pUSD
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.50)).toBe(0.0175);
    expect(calcQuadraticTakerFeeV2('crypto', 0.50, 1000)).toBeCloseTo(17.5, 6);
  });

  it('charges makers nothing and keeps exempt categories at zero', () => {
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.50, true)).toBe(0);
    expect(calcQuadraticTakerFeeRateV2('geopolitics', 0.50)).toBe(0);
    expect(calcQuadraticTakerFeeV2('geopolitics', 0.50, 1000)).toBe(0);
  });

  it('peaks at mid and collapses toward the extremes', () => {
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.10)).toBeLessThan(
      calcQuadraticTakerFeeRateV2('crypto', 0.50),
    );
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.90)).toBeLessThan(
      calcQuadraticTakerFeeRateV2('crypto', 0.50),
    );
  });
});

describe('paper sweep prices on the CLOB V2 curve', () => {
  const book = {
    bids: [{ price: '0.40', size: '100' }],
    asks: [{ price: '0.50', size: '100' }],
  };

  it('uses the V2 quadratic rate rather than the legacy linear curve', () => {
    const sweep = sweepOrderBookLevels(book, 'BUY', 100, 0.50, 'crypto');
    expect(sweep.filledSize).toBe(100);
    // rate 0.0175 * 100 shares * 0.50 avg price = 0.875 USDC
    expect(sweep.feeUsdc).toBeCloseTo(0.875, 6);
  });

  it('honours an explicit category instead of always assuming politics', () => {
    const tableTennis = sweepOrderBookLevels(book, 'BUY', 100, 0.50, 'table_tennis');
    // table_tennis rCat 0.10 => rate 0.025 * 100 shares * 0.50 avg price = 1.25 USDC
    expect(tableTennis.feeUsdc).toBeCloseTo(1.25, 6);
  });

  it('charges nothing for a fee-exempt category', () => {
    const exempt = sweepOrderBookLevels(book, 'BUY', 100, 0.50, 'geopolitics');
    expect(exempt.feeUsdc).toBe(0);
  });

  it('defaults to politics so the existing single caller stays unchanged', () => {
    // politics rCat 0.04 => rate 0.01 at mid => 0.01 * 100 * 0.50 = 0.50 USDC
    expect(sweepOrderBookLevels(book, 'BUY', 100, 0.50).feeUsdc).toBeCloseTo(0.5, 6);
  });
});

describe('profitability calculator prices on the CLOB V2 curve', () => {
  it('reports the quadratic rate and its pUSD fee', () => {
    const res = calculatePolymarketFee('crypto', 0.50, 1000);
    expect(res.rate).toBeCloseTo(0.0175, 6);
    expect(res.feeUsd).toBeCloseTo(17.5, 2);
    // 20% of collected taker fees is the V2 maker rebate pool
    expect(res.rebateUsd).toBeCloseTo(3.5, 2);
  });

  it('still returns zero for fee-exempt categories', () => {
    const res = calculatePolymarketFee('geopolitics', 0.90, 1000);
    expect(res.rate).toBe(0);
    expect(res.feeUsd).toBe(0);
  });

  it('prices the new football category through the same profitability entry point', () => {
    const res = calculatePolymarketFee('nfl_college_football', 0.50, 1000);
    expect(res.rate).toBeCloseTo(0.0075, 6);
    expect(res.feeUsd).toBeCloseTo(7.5, 2);
  });
});

describe('classifier backwards compatibility', () => {
  it('keeps generic sports questions on the sports schedule', () => {
    expect(classifyMarketCategory('NBA Finals champion 2026')).toBe('sports');
    expect(classifyMarketCategory('Ukraine ceasefire by July')).toBe('geopolitics');
  });

  it('keeps unknown descriptions on the politics default', () => {
    expect(classifyMarketCategory('')).toBe<PolymarketCategory>('politics');
  });
});

describe('taker BUY share deduction breaks merge parity', () => {
  it('delivers fewer mergeable pairs than requested once fees are deducted in shares', () => {
    const parity = computeTakerBuyNetSharesAndMergeablePairs(100, 0.48, 0.49, 'crypto');
    expect(parity.yesNetShares).toBeLessThan(100);
    expect(parity.noNetShares).toBeLessThan(100);
    expect(parity.mergeablePairs).toBe(Math.min(parity.yesNetShares, parity.noNetShares));
    expect(parity.mergeablePairs).toBeLessThan(100);
    expect(parity.canMergeFullRequestedPairs).toBe(false);
  });

  it('preserves full parity for a fee-exempt category', () => {
    const parity = computeTakerBuyNetSharesAndMergeablePairs(100, 0.48, 0.49, 'geopolitics');
    expect(parity.yesFeeRate).toBe(0);
    expect(parity.noFeeRate).toBe(0);
    expect(parity.mergeablePairs).toBe(100);
    expect(parity.canMergeFullRequestedPairs).toBe(true);
  });

  it('reports the grossed-up share counts needed to restore full parity', () => {
    const parity = computeTakerBuyNetSharesAndMergeablePairs(100, 0.50, 0.50, 'crypto');
    const rate = 0.07 * 0.5 * 0.5; // 0.0175
    expect(parity.grossUpYesShares).toBe(Math.ceil(100 / (1 - rate)));
    expect(parity.grossUpNoShares).toBe(Math.ceil(100 / (1 - rate)));
    expect(parity.grossUpYesShares).toBeGreaterThan(100);
  });
});
