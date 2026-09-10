/**
 * Tests for price-impact-estimator-config — covers DEFAULT_CONFIG, strategy
 * name, and all exported pure helpers (simulatePriceImpact,
 * calcImpactAsymmetry, determineSide, updateImpactEma, bestBidAsk).
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type OpenPosition,
  simulatePriceImpact,
  calcImpactAsymmetry,
  determineSide,
  updateImpactEma,
  bestBidAsk,
} from '../price-impact-estimator-config';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('DEFAULT_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_CONFIG.hypotheticalSize).toBe(500);
    expect(DEFAULT_CONFIG.asymmetryThreshold).toBe(2.0);
    expect(DEFAULT_CONFIG.impactEmaAlpha).toBe(0.1);
    expect(DEFAULT_CONFIG.minVolume).toBe(5000);
    expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.025);
    expect(DEFAULT_CONFIG.stopLossPct).toBe(0.02);
    expect(DEFAULT_CONFIG.maxHoldMs).toBe(15 * 60_000);
    expect(DEFAULT_CONFIG.maxPositions).toBe(4);
    expect(DEFAULT_CONFIG.cooldownMs).toBe(120_000);
    expect(DEFAULT_CONFIG.positionSize).toBe('10');
  });

  it('is a non-null object', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(typeof DEFAULT_CONFIG).toBe('object');
  });
});

describe('STRATEGY_NAME', () => {
  it('equals price-impact-estimator', () => {
    expect(STRATEGY_NAME).toBe('price-impact-estimator');
  });
});

describe('OpenPosition', () => {
  it('is a usable type annotation', () => {
    const pos: OpenPosition = {
      tokenId: 't1',
      conditionId: 'c1',
      side: 'yes',
      entryPrice: 0.5,
      sizeUsdc: 10,
      orderId: 'o1',
      openedAt: 0,
    };
    expect(pos.orderId).toBe('o1');
  });
});

describe('simulatePriceImpact', () => {
  it('returns 0 when orderSize is non-positive', () => {
    expect(simulatePriceImpact([{ price: '0.5', size: '100' }], 0)).toBe(0);
    expect(simulatePriceImpact([{ price: '0.5', size: '100' }], -5)).toBe(0);
  });

  it('returns 0 when levels is empty', () => {
    expect(simulatePriceImpact([], 100)).toBe(0);
  });

  it('returns 0 when there is insufficient liquidity', () => {
    // Only 50 shares available, order is 100 → remaining > 0
    expect(simulatePriceImpact([{ price: '0.5', size: '50' }], 100)).toBe(0);
  });

  it('fills from the cheapest levels first', () => {
    const out = simulatePriceImpact(
      [
        { price: '0.5', size: '30' },
        { price: '0.6', size: '70' },
      ],
      50,
    );
    // 30 @ 0.5 + 20 @ 0.6 = 15 + 12 = 27 / 50
    expect(out).toBeCloseTo(27 / 50, 6);
  });

  it('skips invalid levels (size<=0 or price<=0)', () => {
    const out = simulatePriceImpact(
      [
        { price: '0', size: '100' },
        { price: '-1', size: '50' },
        { price: '0.4', size: '60' },
      ],
      50,
    );
    expect(out).toBe(0.4);
  });

  it('stops filling once order is complete', () => {
    const out = simulatePriceImpact(
      [
        { price: '0.4', size: '100' },
        { price: '0.5', size: '1000' },
      ],
      50,
    );
    expect(out).toBe(0.4);
  });
});

describe('calcImpactAsymmetry', () => {
  it('returns the normalized absolute difference', () => {
    expect(calcImpactAsymmetry(0.5, 0.3, 0.4)).toBeCloseTo(0.2 / 0.4, 6);
  });

  it('returns 0 when mid is 0', () => {
    expect(calcImpactAsymmetry(0.5, 0.3, 0)).toBe(0);
  });

  it('returns 0 when impacts are equal', () => {
    expect(calcImpactAsymmetry(0.4, 0.4, 0.5)).toBe(0);
  });
});

describe('determineSide', () => {
  it('returns yes when buy impact is lower', () => {
    expect(determineSide(0.3, 0.5)).toBe('yes');
  });

  it('returns no when sell impact is lower', () => {
    expect(determineSide(0.5, 0.3)).toBe('no');
  });

  it('returns null when impacts are equal', () => {
    expect(determineSide(0.4, 0.4)).toBe(null);
  });
});

describe('updateImpactEma', () => {
  it('returns the value on the first sample (prev null)', () => {
    expect(updateImpactEma(null, 5, 0.1)).toBe(5);
  });

  it('returns value when alpha >= 1', () => {
    expect(updateImpactEma(2, 5, 1)).toBe(5);
  });

  it('returns prev when alpha <= 0', () => {
    expect(updateImpactEma(2, 5, 0)).toBe(2);
    expect(updateImpactEma(2, 5, -0.5)).toBe(2);
  });

  it('computes alpha-weighted EMA', () => {
    // 0.1 * 10 + 0.9 * 2 = 1 + 1.8 = 2.8
    expect(updateImpactEma(2, 10, 0.1)).toBeCloseTo(2.8, 6);
  });
});

describe('bestBidAsk', () => {
  it('extracts bid/ask/mid from a populated book', () => {
    const book = {
      bids: [{ price: '0.4', size: '100' }],
      asks: [{ price: '0.6', size: '100' }],
      timestamp: 0,
    };
    expect(bestBidAsk(book)).toEqual({ bid: 0.4, ask: 0.6, mid: 0.5 });
  });

  it('defaults bid to 0 when no bids', () => {
    const book = { bids: [], asks: [{ price: '0.6', size: '100' }], timestamp: 0 };
    expect(bestBidAsk(book)).toEqual({ bid: 0, ask: 0.6, mid: 0.3 });
  });

  it('defaults ask to 1 when no asks', () => {
    const book = { bids: [{ price: '0.4', size: '100' }], asks: [], timestamp: 0 };
    expect(bestBidAsk(book)).toEqual({ bid: 0.4, ask: 1, mid: 0.7 });
  });

  it('uses the first level only', () => {
    const book = {
      bids: [
        { price: '0.3', size: '10' },
        { price: '0.2', size: '10' },
      ],
      asks: [
        { price: '0.5', size: '10' },
        { price: '0.7', size: '10' },
      ],
      timestamp: 0,
    };
    expect(bestBidAsk(book)).toEqual({ bid: 0.3, ask: 0.5, mid: 0.4 });
  });
});