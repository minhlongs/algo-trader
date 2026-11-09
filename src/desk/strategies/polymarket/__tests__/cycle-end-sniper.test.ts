import { describe, it, expect } from 'vitest';
import {
  scanCycleEndOpportunities,
  isInEntryWindow,
  computeSnipeExpectedProfitV2,
  evaluateSnipeMarket,
} from '../cycle-end-sniper';

describe('cycle-end-sniper::scanCycleEndOpportunities', () => {
  const mkMarket = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    conditionId: 'c1',
    question: 'Test market?',
    outcomePrices: '["0.96"]',
    endDate: new Date(Date.now() + 60_000).toISOString(),
    active: true,
    closed: false,
    volume: 10000,
    ...overrides,
  });

  it('returns empty for closed markets', () => {
    const r = scanCycleEndOpportunities([mkMarket({ closed: true })]);
    expect(r).toHaveLength(0);
  });
  it('returns empty for markets with no endDate', () => {
    const r = scanCycleEndOpportunities([mkMarket({ endDate: null, endDateIso: null })]);
    expect(r).toHaveLength(0);
  });
  it('returns empty for expired markets', () => {
    const r = scanCycleEndOpportunities([mkMarket({ endDate: new Date(Date.now() - 60_000).toISOString() })]);
    expect(r).toHaveLength(0);
  });
  it('returns empty for markets outside window (>5 min)', () => {
    const r = scanCycleEndOpportunities([mkMarket({ endDate: new Date(Date.now() + 6 * 60_000).toISOString() })]);
    expect(r).toHaveLength(0);
  });
  it('returns YES signal for strongly YES market', () => {
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: '["0.97"]' })]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].predictedOutcome).toBe('YES');
    expect(r[0].currentYesPrice).toBeCloseTo(0.97, 2);
  });
  it('returns NO signal for strongly NO market', () => {
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: '["0.03"]' })]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].predictedOutcome).toBe('NO');
  });
  it('filters by volume', () => {
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: '["0.97"]', volume: 100 })]);
    expect(r).toHaveLength(0);
  });
  it('filters by minimum profit after fee', () => {
    // price 0.99: expectedProfit = (1 - 0.99) - 0.02 = -0.01 < MIN_PROFIT
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: '["0.99"]', volume: 10000 })]);
    expect(r).toHaveLength(0);
  });
  it('returns YES for array outcomePrices', () => {
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: ['0.96', '0.04'] })]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].predictedOutcome).toBe('YES');
  });
  it('returns NO for array outcomePrices', () => {
    const r = scanCycleEndOpportunities([mkMarket({ outcomePrices: ['0.04', '0.96'] })]);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].predictedOutcome).toBe('NO');
  });
  it('sorts by shortest timeToResolution first', () => {
    const soon = mkMarket({ conditionId: 'c-soon', outcomePrices: '["0.97"]', endDate: new Date(Date.now() + 30_000).toISOString() });
    const later = mkMarket({ conditionId: 'c-later', outcomePrices: '["0.03"]', endDate: new Date(Date.now() + 240_000).toISOString() });
    const r = scanCycleEndOpportunities([later, soon]);
    // Both should be in results, sorted by timeToResolution ascending
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r[0].timeToResolution).toBeLessThanOrEqual(r[1].timeToResolution);
  });
});

describe('cycle-end-sniper::isInEntryWindow', () => {
  it('true when timeToResolution is 30s', () => {
    expect(isInEntryWindow({ timeToResolution: 30 } as any)).toBe(true);
  });
  it('false when timeToResolution is 61s', () => {
    expect(isInEntryWindow({ timeToResolution: 61 } as any)).toBe(false);
  });
  it('true at exactly 60s', () => {
    expect(isInEntryWindow({ timeToResolution: 60 } as any)).toBe(true);
  });
  it('true when timeToResolution is 0 (always within window)', () => {
    expect(isInEntryWindow({ timeToResolution: 0 } as never)).toBe(true);
  });
});

describe('cycle-end-sniper::CLOB V2 fee model', () => {
  it('computes higher expected profit under CLOB V2 quadratic fee at p=0.98 than flat 2% legacy fee', () => {
    const profitCrypto = computeSnipeExpectedProfitV2(0.98, 'crypto');
    const profitGeopolitics = computeSnipeExpectedProfitV2(0.98, 'geopolitics');
    // At p=0.98, p*(1-p) = 0.0196 -> quadratic fee rate is tiny (~0.14%), so net profit > 0.018
    expect(profitCrypto).toBeGreaterThan(0.018);
    expect(profitGeopolitics).toBeCloseTo(0.02, 6);

    const now = Date.now();
    const m = {
      conditionId: 'btc-1',
      question: 'Will Bitcoin exceed $100k?',
      outcomePrices: '["0.985"]',
      endDate: new Date(now + 45_000).toISOString(),
      active: true,
      closed: false,
      volume: 25_000,
    };
    // Legacy flat 2% rejects 0.985 ((1 - 0.985) - 0.02 = -0.005 < MIN_PROFIT)
    expect(evaluateSnipeMarket(m, now)).toBeNull();
    // CLOB V2 accepts 0.985 because quadratic fee at tail p=0.985 is ~0.00106, leaving ~1.39% > 0.5%
    const v2Sig = evaluateSnipeMarket(m, now, { useClobV2Fees: true });
    expect(v2Sig).not.toBeNull();
    expect(v2Sig?.expectedProfit).toBeGreaterThan(0.01);
  });
});
